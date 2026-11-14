import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { CrawlCancelledError, crawlAndAudit } from "@/lib/seo/crawler";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { persistCrawlResult } from "@/lib/seo/persist-crawl";

/**
 * How long a worker owns a claimed job. Slightly longer than the 300 s function limit, so a job whose
 * worker was killed becomes claimable again soon after (the progress check restarts it).
 */
export const CRAWL_LEASE_MS = 330_000;

/**
 * Most crawls allowed to run at once across all workspaces. Extra jobs stay queued and start when a slot
 * frees up (each progress poll retries them), so a burst of users cannot overload the database or the host.
 */
export function crawlConcurrencyLimit() {
  const value = Number(process.env.SEO_CRAWL_MAX_CONCURRENCY);
  return Number.isInteger(value) && value >= 1 && value <= 200 ? value : 20;
}

export type CrawlWorkerResult = { processed: boolean; status?: string; message?: string; [key: string]: unknown };

function claimedDocument<T>(result: T | { value?: T | null } | null): T | null {
  if (!result) return null;
  return typeof result === "object" && "value" in result ? (result.value ?? null) : result as T;
}

/**
 * Claims one due crawl job (optionally a specific one) and runs it to completion, failure, retry or cancellation.
 * Safe to call concurrently: the claim is atomic and every later write is fenced by the lease token.
 */
export async function processNextCrawlJob(db: Db, options: { jobId?: string } = {}): Promise<CrawlWorkerResult> {
  await ensureSeoIndexes(db);
  const now = new Date();
  const leaseToken = randomUUID();
  const running = await db.collection("seo_crawl_jobs").countDocuments({ status: { $in: ["running", "saving"] }, leaseUntil: { $gt: now } });
  if (running >= crawlConcurrencyLimit()) return { processed: false, status: "busy", message: "All crawl slots are busy. The job stays queued and starts shortly." };
  const claim = await db.collection("seo_crawl_jobs").findOneAndUpdate(
    { ...(options.jobId ? { jobId: options.jobId } : {}), $or: [
      { status: { $in: ["queued", "retrying"] }, $and: [{ $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }] }, { $or: [{ leaseUntil: { $lt: now } }, { leaseUntil: { $exists: false } }] }] },
      { status: "running", leaseUntil: { $lte: now } },
      // If a worker died during the idempotent persistence phase, reclaim and
      // rerun the crawl instead of leaving the website permanently stuck.
      { status: "saving", leaseUntil: { $lte: now } },
    ] },
    { $set: { status: "running", leaseToken, leaseUntil: new Date(now.getTime() + CRAWL_LEASE_MS), updatedAt: now, lastAttemptAt: now }, $inc: { attemptCount: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
  const job = claimedDocument(claim);
  if (!job) return { processed: false, message: "No crawl jobs are due." };
  const jobId = String(job.jobId);
  const auditId = String(job.auditId);
  const attempts = Number(job.attemptCount || 1);
  const startedAt = job.startedAt instanceof Date ? job.startedAt : now;
  const jobs = db.collection("seo_crawl_jobs");
  const events = db.collection("seo_crawl_job_events");
  await events.insertOne({ jobId, auditId, action: "started", attempt: attempts, createdAt: now });
  const site = await db.collection("websites").findOne({ _id: job.websiteId, domain: job.websiteDomain, verifiedAt: { $exists: true }, active: { $ne: false } });
  if (!site) {
    const message = "The website is no longer active and verified.";
    const failedAt = new Date();
    await jobs.updateOne({ jobId, leaseToken }, { $set: { status: "failed", error: message, completedAt: failedAt, updatedAt: failedAt }, $unset: { leaseToken: "", leaseUntil: "" } });
    await db.collection("seo_audits").updateOne({ auditId }, { $set: { status: "failed", error: message, completedAt: failedAt } });
    await events.insertOne({ jobId, auditId, action: "failed", attempt: attempts, message, createdAt: failedAt });
    return { processed: true, status: "failed" };
  }
  const shouldCancel = async () => Boolean(await jobs.findOne({ jobId, leaseToken, status: { $in: ["cancel_requested", "cancelled"] } }, { projection: { _id: 1 } }));
  try {
    const result = await crawlAndAudit(String(site.url), Math.max(1, Math.min(Number(job.maxPages) || 25, Number(site.maxPages) || 25)), {
      sitemapUrl: typeof site.sitemapUrl === "string" ? site.sitemapUrl : undefined,
      robotsUrl: typeof site.robotsUrl === "string" ? site.robotsUrl : undefined,
      primaryKeywords: Array.isArray(site.primaryKeywords) ? site.primaryKeywords.filter((keyword): keyword is string => typeof keyword === "string") : undefined,
      shouldCancel,
      onProgress: async (progress) => { await jobs.updateOne({ jobId, leaseToken, status: "running" }, { $set: { progress, updatedAt: new Date() } }); },
    });
    if (await shouldCancel()) throw new CrawlCancelledError();
    const saving = await jobs.updateOne({ jobId, leaseToken, status: "running" }, { $set: { status: "saving", updatedAt: new Date() } });
    if (!saving.modifiedCount) throw new CrawlCancelledError();
    const summary = await persistCrawlResult({ db, site, ownerId: String(job.ownerId), auditId, pages: result.pages, skippedByRobots: result.skippedByRobots, failedPages: result.failedPages, searchAccess: result.searchAccess, startedAt });
    const completedAt = new Date();
    await jobs.updateOne({ jobId, leaseToken }, { $set: { status: "completed", summary, progress: { ...job.progress, pagesScanned: summary.pageCount }, completedAt, updatedAt: completedAt }, $unset: { leaseToken: "", leaseUntil: "", nextAttemptAt: "", error: "" } });
    if (job.scheduled) await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastScheduledAuditAt: completedAt, lastScheduledAuditStatus: "completed", lastScheduledAuditAuditId: auditId } });
    await events.insertOne({ jobId, auditId, action: "completed", attempt: attempts, pageCount: summary.pageCount, issueCount: summary.issueCounts.critical + summary.issueCounts.warning + summary.issueCounts.notice, createdAt: completedAt });
    return { processed: true, status: "completed", jobId, auditId, summary };
  } catch (caught) {
    const failedAt = new Date();
    const cancellation = caught instanceof CrawlCancelledError || await shouldCancel();
    if (cancellation) {
      await jobs.updateOne({ jobId, leaseToken }, { $set: { status: "cancelled", completedAt: failedAt, updatedAt: failedAt }, $unset: { leaseToken: "", leaseUntil: "", nextAttemptAt: "" } });
      await db.collection("seo_audits").updateOne({ auditId }, { $set: { status: "cancelled", completedAt: failedAt } });
      if (job.scheduled) await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastScheduledAuditAt: failedAt, lastScheduledAuditStatus: "cancelled", nextScheduledAuditAt: new Date(failedAt.getTime() + 60 * 60_000) } });
      await events.insertOne({ jobId, auditId, action: "cancelled", attempt: attempts, createdAt: failedAt });
      return { processed: true, status: "cancelled", jobId };
    }
    const message = caught instanceof Error ? caught.message.slice(0, 500) : "The crawl failed.";
    const terminal = attempts >= 3;
    const nextAttemptAt = new Date(failedAt.getTime() + Math.min(5 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1)));
    const status = terminal ? "failed" : "retrying";
    await jobs.updateOne({ jobId, leaseToken }, { $set: { status, error: message, ...(terminal ? { completedAt: failedAt } : { nextAttemptAt }), updatedAt: failedAt }, $unset: { leaseToken: "", leaseUntil: "" } });
    await db.collection("seo_audits").updateOne({ auditId }, { $set: { status, error: message, ...(terminal ? { completedAt: failedAt } : {}) } });
    await events.insertOne({ jobId, auditId, action: status, attempt: attempts, message, ...(terminal ? {} : { nextAttemptAt }), createdAt: failedAt });
    await db.collection("audit_logs").insertOne({ ownerId: job.ownerId, organizationId: job.organizationId, websiteDomain: job.websiteDomain, action: `seo.audit.${status}`, auditId, jobId, attempt: attempts, createdAt: failedAt });
    if (terminal && job.scheduled) await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastScheduledAuditAt: failedAt, lastScheduledAuditStatus: "failed", lastScheduledAuditError: message.slice(0, 500), nextScheduledAuditAt: new Date(failedAt.getTime() + 60 * 60_000) } });
    return { processed: true, status, jobId, ...(terminal ? { error: message } : { nextAttemptAt }) };
  }
}
