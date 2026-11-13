import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getHealthScoreDetails } from "@/lib/seo/audit";
import { crawlAndAudit, seoCrawlPageLimit } from "@/lib/seo/crawler";
import { ensureSeoIndexes } from "@/lib/seo/indexes";

export const maxDuration = 120;
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "A valid CRON_SECRET bearer token is required." }, { status: 401 });
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const now = new Date();
  const leaseToken = randomUUID();
  const claimed = await db.collection("websites").findOneAndUpdate(
    { active: { $ne: false }, verifiedAt: { $exists: true }, crawlFrequency: { $in: ["weekly", "monthly"] }, nextScheduledAuditAt: { $lte: now }, $and: [{ $or: [{ lastAuditAttemptAt: { $lt: new Date(now.getTime() - 60_000) } }, { lastAuditAttemptAt: { $exists: false } }] }, { $or: [{ scheduledAuditLeaseUntil: { $lt: now } }, { scheduledAuditLeaseUntil: { $exists: false } }] }] },
    { $set: { lastAuditAttemptAt: now, scheduledAuditLeaseToken: leaseToken, scheduledAuditLeaseUntil: new Date(now.getTime() + 4 * 60_000) } },
    { sort: { nextScheduledAuditAt: 1 }, returnDocument: "after" },
  );
  const site = claimed && "value" in claimed ? claimed.value : claimed;
  if (!site) return NextResponse.json({ processed: false, message: "No scheduled audits are due." });
  // Scheduled crawls use the durable queue by default. The synchronous path
  // remains available only as an explicit temporary compatibility switch.
  if (process.env.LEGACY_SYNC_AUDITS !== "true") {
    const jobs = db.collection("seo_crawl_jobs");
    const frequency = site.crawlFrequency === "weekly" ? "weekly" : "monthly";
    const nextScheduledAuditAt = new Date(now.getTime() + (frequency === "weekly" ? 7 : 30) * 86_400_000);
    const active = await jobs.findOne({ websiteDomain: site.domain, organizationId: site.organizationId, status: { $in: ["queued", "running", "saving", "retrying", "cancel_requested"] } }, { sort: { createdAt: -1 }, projection: { jobId: 1 } });
    if (active) {
      await db.collection("websites").updateOne({ _id: site._id, scheduledAuditLeaseToken: leaseToken }, { $set: { lastScheduledAuditAt: now, lastScheduledAuditStatus: "skipped_active", nextScheduledAuditAt }, $unset: { scheduledAuditLeaseToken: "", scheduledAuditLeaseUntil: "" } });
      return NextResponse.json({ processed: true, status: "skipped_active", domain: site.domain, jobId: active.jobId });
    }
    const jobId = randomUUID();
    const auditId = randomUUID();
    const ownerId = typeof site.ownerId === "string" ? site.ownerId : "system";
    const maxPages = Math.max(1, Math.min(seoCrawlPageLimit(), Number(site.maxPages) || seoCrawlPageLimit()));
    const progress = { pagesScanned: 0, pagesAttempted: 0, pagesQueued: 1, failedPages: 0, skippedByRobots: 0, maxPages };
    await jobs.insertOne({ jobId, auditId, ownerId, organizationId: site.organizationId, websiteDomain: site.domain, websiteId: site._id, url: site.url, maxPages, scheduled: true, crawlFrequency: frequency, status: "queued", progress, attemptCount: 0, createdAt: now, updatedAt: now });
    await db.collection("seo_audits").insertOne({ auditId, ownerId, organizationId: site.organizationId, websiteDomain: site.domain, status: "queued", pageCount: 0, startedAt: now, source: "scheduled_first_party_crawler" });
    await db.collection("seo_crawl_job_events").insertOne({ jobId, auditId, action: "queued", source: "scheduler", createdAt: now });
    await db.collection("audit_logs").insertOne({ ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: site.domain, action: "seo.audit.scheduled_queued", auditId, jobId, createdAt: now });
    await db.collection("websites").updateOne({ _id: site._id, scheduledAuditLeaseToken: leaseToken }, { $set: { lastScheduledAuditAt: now, lastScheduledAuditStatus: "queued", nextScheduledAuditAt }, $unset: { scheduledAuditLeaseToken: "", scheduledAuditLeaseUntil: "" } });
    return NextResponse.json({ processed: true, status: "queued", domain: site.domain, jobId, auditId, maxPages });
  }
  const startedAt = now; const auditId = randomUUID(); const ownerId = typeof site.ownerId === "string" ? site.ownerId : "system";
  try {
    const { pages, skippedByRobots } = await crawlAndAudit(site.url, Math.min(Number(site.maxPages) || 10, 10), { sitemapUrl: site.sitemapUrl, robotsUrl: site.robotsUrl, primaryKeywords: site.primaryKeywords });
    if (!pages.length) throw new Error("No crawlable HTML pages were found.");
    const scoreDetails = getHealthScoreDetails(pages);
    if (!scoreDetails) throw new Error("No score could be calculated.");
    const completedAt = new Date();
    const issueCounts = pages.flatMap((page) => page.issues).reduce((counts, item) => { counts[item.severity]++; return counts; }, { critical: 0, warning: 0, notice: 0 });
    const cmsCandidates = pages.flatMap((page) => page.cmsDetection ? [page.cmsDetection] : []);
    const cmsGroups = cmsCandidates.reduce((groups, item) => groups.set(item.name, [...(groups.get(item.name) ?? []), item]), new Map<string, typeof cmsCandidates>());
    const detectedCms = [...cmsGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[1][0] ?? null;
    const summary = { auditId, status: "completed", score: scoreDetails.score, components: scoreDetails.components, confidence: scoreDetails.confidence, confidenceNote: scoreDetails.confidenceNote, pageCount: pages.length, issueCounts, skippedByRobots, detectedCms, startedAt, completedAt, scoreVersion: "seo-health-v1", source: "scheduled_first_party_crawler" };
    await db.collection("seo_audits").insertOne({ ...summary, ownerId, organizationId: site.organizationId, websiteDomain: site.domain });
    await db.collection("seo_pages").insertMany(pages.map((page) => ({ ...page, ownerId, organizationId: site.organizationId, websiteDomain: site.domain, auditId, crawledAt: completedAt })));
    const findings = pages.flatMap((page) => page.issues.map((item) => ({ ...item, ownerId, organizationId: site.organizationId, websiteDomain: site.domain, auditId, pageUrl: page.url })));
    const newlyCritical: Array<{ title: string; pageUrl: string }> = [];
    for (const finding of findings) {
      const identity = { organizationId: site.organizationId, websiteDomain: site.domain, pageUrl: finding.pageUrl, ruleId: finding.ruleId };
      const existing = await db.collection("seo_issues").findOne(identity, { projection: { _id: 1, status: 1 } });
      const reopened = existing && ["resolved", "ignored", "done"].includes(String(existing.status));
      const issueResult = await db.collection("seo_issues").updateOne(identity, { $set: { ...finding, status: reopened ? "open" : existing?.status || "open", lastDetectedAt: completedAt }, $setOnInsert: { firstDetectedAt: completedAt, createdAt: completedAt }, $inc: { detectionCount: 1 } }, { upsert: true });
      const issueId = existing?._id || issueResult.upsertedId;
      if (finding.severity === "critical" && (!existing || reopened)) newlyCritical.push({ title: finding.title, pageUrl: finding.pageUrl });
      if (issueId) await db.collection("seo_issue_history").insertOne({ ownerId, organizationId: site.organizationId, websiteDomain: site.domain, issueId, auditId, action: reopened ? "reopened" : "detected", severity: finding.severity, evidence: finding.evidence, detectedAt: completedAt });
    }
    await db.collection("seo_scores").insertOne({ ownerId, organizationId: site.organizationId, websiteDomain: site.domain, auditId, score: scoreDetails.score, version: summary.scoreVersion, components: scoreDetails.components, confidence: scoreDetails.confidence, scoredAt: completedAt });
    await db.collection("websites").updateOne({ _id: site._id, scheduledAuditLeaseToken: leaseToken }, { $set: { lastAudit: summary, detectedCms, lastScheduledAuditAt: completedAt, lastScheduledAuditStatus: "completed", nextScheduledAuditAt: new Date(completedAt.getTime() + (site.crawlFrequency === "weekly" ? 7 : 30) * 86400_000), updatedAt: completedAt }, $unset: { scheduledAuditLeaseToken: "", scheduledAuditLeaseUntil: "" } });
    await db.collection("audit_logs").insertOne({ ownerId, userId: ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: site.domain, action: "seo.audit.scheduled_completed", auditId, pageCount: pages.length, issueCount: findings.length, ...(detectedCms ? { detectedCms } : {}), createdAt: completedAt });
    const members = await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active" }, { projection: { userId: 1 } }).toArray();
    if (members.length) await db.collection("notifications").insertMany(members.map((member) => ({ userId: member.userId, organizationId: site.organizationId, websiteDomain: site.domain, type: "audit.completed", title: `Scheduled audit completed for ${site.domain}`, message: `${pages.length} pages scanned · ${findings.length} findings · SEO Health ${scoreDetails.score}/100.`, auditId, createdAt: completedAt })));
    if (members.length && newlyCritical.length) await db.collection("notifications").insertMany(members.map((member) => ({ userId: member.userId, organizationId: site.organizationId, websiteDomain: site.domain, type: "audit.critical_issues", title: `${newlyCritical.length} new critical SEO issue${newlyCritical.length === 1 ? "" : "s"} for ${site.domain}`, message: newlyCritical.slice(0, 3).map((item) => `${item.title} (${item.pageUrl})`).join(" · "), auditId, createdAt: completedAt })));
    return NextResponse.json({ processed: true, domain: site.domain, auditId, pageCount: pages.length, issueCount: findings.length, score: scoreDetails.score });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled audit failed.";
    const failedAt = new Date();
    await db.collection("seo_audits").updateOne({ auditId }, { $set: { ownerId, organizationId: site.organizationId, websiteDomain: site.domain, status: "failed", error: message, completedAt: failedAt }, $setOnInsert: { auditId, startedAt } }, { upsert: true });
    await db.collection("websites").updateOne({ _id: site._id, scheduledAuditLeaseToken: leaseToken }, { $set: { lastScheduledAuditAt: failedAt, lastScheduledAuditStatus: "failed", lastScheduledAuditError: message, nextScheduledAuditAt: new Date(failedAt.getTime() + 3600_000) }, $unset: { scheduledAuditLeaseToken: "", scheduledAuditLeaseUntil: "" } });
    await db.collection("audit_logs").insertOne({ ownerId, userId: ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: site.domain, action: "seo.audit.scheduled_failed", auditId, createdAt: failedAt });
    return NextResponse.json({ processed: true, domain: site.domain, auditId, error: message }, { status: 502 });
  }
}
