import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { seoCrawlPageLimit } from "@/lib/seo/crawler";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { processNextCrawlJob } from "@/lib/seo/crawl-worker";

// The crawl runs in this function after the response is sent (see startCrawlWorker), so allow the full limit.
export const maxDuration = 300;

type Context = { params: Promise<{ domain: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };

/**
 * Runs the crawl right away, after the response is sent, instead of waiting for an external scheduler.
 * The claim is atomic, so extra calls (several tabs polling, a cron) never run the same job twice.
 */
function startCrawlWorker(db: Db, jobId: string) {
  after(async () => {
    try {
      await processNextCrawlJob(db, { jobId });
    } catch (error) {
      console.error("Crawl worker failed:", error instanceof Error ? error.message : error);
    }
  });
}

/** A job nobody is working on: queued/retrying and due, or running/saving with an expired lease (its worker was stopped). */
function needsWorker(job: Record<string, unknown>, now = Date.now()) {
  const due = (value: unknown) => !(value instanceof Date) || value.getTime() <= now;
  if (job.status === "queued" || job.status === "retrying") return due(job.nextAttemptAt) && due(job.leaseUntil);
  if (job.status === "running" || job.status === "saving") return job.leaseUntil instanceof Date && job.leaseUntil.getTime() <= now;
  return false;
}

async function getContext(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore }) };
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const access = await findAccessibleWebsite(db, session.user.id, domain, "audit.run");
  if (!access.website || access.website.active === false) return { response: NextResponse.json({ error: "Website not found or inactive." }, { status: 404, headers: noStore }) };
  return { session, domain, db, site: access.website };
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const result = await getContext(request, context);
  if (result.response) return result.response;
  const { session, db, domain, site } = result;
  if (!site.verifiedAt) return NextResponse.json({ error: "Verify domain ownership before crawling." }, { status: 403, headers: noStore });
  const jobs = db.collection("seo_crawl_jobs");
  const active = await jobs.findOne({ websiteDomain: domain, organizationId: site.organizationId, status: { $in: ["queued", "running", "saving", "retrying", "cancel_requested"] } }, { sort: { createdAt: -1 } });
  if (active) {
    if (needsWorker(active)) startCrawlWorker(db, String(active.jobId));
    return NextResponse.json({ jobId: active.jobId, auditId: active.auditId, status: active.status, progress: active.progress }, { status: 202, headers: noStore });
  }

  const accountLimit = await consumeRateLimit(db, "seo-crawl", String(site.organizationId || site.ownerId), 5, 60 * 60_000);
  if (!accountLimit.allowed) return NextResponse.json({ error: "This workspace has reached its crawl limit. Try again later." }, { status: 429, headers: { ...noStore, "Retry-After": String(accountLimit.retryAfterSeconds) } });

  const startedAt = new Date();
  const throttle = await db.collection("websites").updateOne(
    { _id: site._id, $or: [{ lastAuditAttemptAt: { $lt: new Date(Date.now() - 60_000) } }, { lastAuditAttemptAt: { $exists: false } }] },
    { $set: { lastAuditAttemptAt: startedAt } },
  );
  if (!throttle.matchedCount) return NextResponse.json({ error: "Please wait one minute between site crawls." }, { status: 429, headers: noStore });
  const jobId = randomUUID();
  const auditId = randomUUID();
  const maxPages = Math.max(1, Math.min(seoCrawlPageLimit(), Number(site.maxPages) || 25));
  const progress = { pagesScanned: 0, pagesAttempted: 0, pagesQueued: 1, failedPages: 0, skippedByRobots: 0, maxPages };
  const job = { jobId, auditId, ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, websiteId: site._id, url: site.url, maxPages, status: "queued", progress, attemptCount: 0, createdAt: startedAt, updatedAt: startedAt };
  await jobs.insertOne(job);
  await db.collection("seo_audits").insertOne({ auditId, ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, status: "queued", pageCount: 0, startedAt, source: "first_party_crawler" });
  await db.collection("seo_crawl_job_events").insertOne({ jobId, auditId, action: "queued", actorId: session.user.id, createdAt: startedAt });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "seo.audit.queued", auditId, jobId, createdAt: startedAt });
  startCrawlWorker(db, jobId);
  return NextResponse.json({ jobId, auditId, status: "queued", progress }, { status: 202, headers: noStore });
}

export async function GET(request: Request, context: Context) {
  const result = await getContext(request, context);
  if (result.response) return result.response;
  const { session, db, domain, site } = result;
  const jobId = new URL(request.url).searchParams.get("jobId");
  const scope = { websiteDomain: domain, organizationId: site.organizationId, $or: [{ ownerId: session.user.id }, { organizationId: site.organizationId }] };
  if (!jobId) {
    const recentJobs = await db.collection("seo_crawl_jobs").find(scope, { projection: { _id: 0, jobId: 1, auditId: 1, status: 1, progress: 1, attemptCount: 1, nextAttemptAt: 1, error: 1, updatedAt: 1, createdAt: 1, summary: 1, leaseUntil: 1, startedAt: 1, lastAttemptAt: 1 } }).sort({ createdAt: -1 }).limit(10).toArray();
    const activeJob = recentJobs.find((item) => ["queued", "running", "saving", "retrying", "cancel_requested"].includes(String(item.status))) ?? null;
    if (activeJob && needsWorker(activeJob)) startCrawlWorker(db, String(activeJob.jobId));
    return NextResponse.json({ activeJob, jobs: recentJobs }, { headers: noStore });
  }
  if (!/^[a-f\d-]{36}$/i.test(jobId)) return NextResponse.json({ error: "A valid crawl job ID is required." }, { status: 400, headers: noStore });
  const job = await db.collection("seo_crawl_jobs").findOne({ ...scope, jobId }, { projection: { _id: 0, jobId: 1, auditId: 1, status: 1, progress: 1, attemptCount: 1, nextAttemptAt: 1, error: 1, updatedAt: 1, createdAt: 1, leaseUntil: 1, lastAttemptAt: 1 } });
  if (!job) return NextResponse.json({ error: "Crawl job not found." }, { status: 404, headers: noStore });
  if (needsWorker(job)) startCrawlWorker(db, jobId);
  const summary = job.status === "completed" ? await db.collection("seo_audits").findOne({ auditId: job.auditId }, { projection: { _id: 0, auditId: 1, score: 1, confidence: 1, confidenceNote: 1, pageCount: 1, issueCounts: 1 } }) : null;
  return NextResponse.json({ ...job, summary }, { headers: noStore });
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const result = await getContext(request, context);
  if (result.response) return result.response;
  const { session, db, domain, site } = result;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !/^[a-f\d-]{36}$/i.test(jobId)) return NextResponse.json({ error: "A valid crawl job ID is required." }, { status: 400, headers: noStore });
  const now = new Date();
  const cancelled = await db.collection("seo_crawl_jobs").findOneAndUpdate(
    { jobId, websiteDomain: domain, organizationId: site.organizationId, $or: [{ ownerId: session.user.id }, { organizationId: site.organizationId }], status: { $in: ["queued", "retrying", "running"] } },
    [{ $set: { status: { $cond: [{ $eq: ["$status", "running"] }, "cancel_requested", "cancelled"] }, cancelRequestedAt: now, updatedAt: now } }],
    { returnDocument: "after" },
  );
  const job = cancelled && "value" in cancelled ? cancelled.value : cancelled;
  if (!job) return NextResponse.json({ error: "This crawl is no longer cancellable." }, { status: 409, headers: noStore });
  await db.collection("seo_audits").updateOne({ auditId: job.auditId, status: "queued" }, { $set: { status: "cancelled", completedAt: now } });
  if (job.scheduled) await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastScheduledAuditAt: now, lastScheduledAuditStatus: "cancelled", nextScheduledAuditAt: new Date(now.getTime() + 60 * 60_000) } });
  await db.collection("seo_crawl_job_events").insertOne({ jobId, auditId: job.auditId, action: "cancel_requested", actorId: session.user.id, createdAt: now });
  return NextResponse.json({ jobId, status: job.status }, { headers: noStore });
}
