import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getHealthScoreDetails } from "@/lib/seo/audit";
import { crawlAndAudit, seoCrawlPageLimit } from "@/lib/seo/crawler";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";

export const maxDuration = 120;
type Context = { params: Promise<{ domain: string }> };

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const access = await findAccessibleWebsite(db, session.user.id, domain, "audit.run");
  const site = access.website;
  if (!site) return NextResponse.json({ error: "Website not found or inactive." }, { status: 404 });
  if (site.active === false) return NextResponse.json({ error: "Website not found or inactive." }, { status: 404 });
  if (!site.verifiedAt) return NextResponse.json({ error: "Verify domain ownership before crawling." }, { status: 403 });
  const accountLimit = await consumeRateLimit(db, "seo-crawl", String(site.organizationId || site.ownerId), 5, 60 * 60_000);
  if (!accountLimit.allowed) return NextResponse.json({ error: "This workspace has reached its crawl limit. Try again later." }, { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSeconds), "Cache-Control": "no-store" } });
  const startedAt = new Date();
  const throttle = await db.collection("websites").updateOne(
    { _id: site._id, $or: [{ lastAuditAttemptAt: { $lt: new Date(Date.now() - 60_000) } }, { lastAuditAttemptAt: { $exists: false } }] },
    { $set: { lastAuditAttemptAt: startedAt } },
  );
  if (!throttle.matchedCount) return NextResponse.json({ error: "Please wait one minute between site crawls." }, { status: 429 });
  const auditId = randomUUID();
  try {
    const { pages, skippedByRobots, failedPages, searchAccess } = await crawlAndAudit(site.url, Math.min(Number(site.maxPages) || seoCrawlPageLimit(), seoCrawlPageLimit()), { sitemapUrl: site.sitemapUrl, robotsUrl: site.robotsUrl, primaryKeywords: site.primaryKeywords });
    if (!pages.length) throw new Error("No crawlable HTML pages were found.");
    const scoreDetails = getHealthScoreDetails(pages);
    if (!scoreDetails) throw new Error("No score could be calculated.");
    const { score } = scoreDetails;
    const issueCounts = pages.flatMap((page) => page.issues).reduce((counts, item) => {
      counts[item.severity]++;
      return counts;
    }, { critical: 0, warning: 0, notice: 0 });
    const cmsCandidates = pages.flatMap((page) => page.cmsDetection ? [page.cmsDetection] : []);
    const cmsGroups = cmsCandidates.reduce((groups, item) => groups.set(item.name, [...(groups.get(item.name) ?? []), item]), new Map<string, typeof cmsCandidates>());
    const detectedCms = [...cmsGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[1][0] ?? null;
    const completedAt = new Date();
    const summary = { auditId, status: "completed", score, components: scoreDetails.components, confidence: scoreDetails.confidence, confidenceNote: scoreDetails.confidenceNote, pageCount: pages.length, issueCounts, skippedByRobots, failedPages, detectedCms, searchAccess, startedAt, completedAt, scoreVersion: "seo-health-v1", source: "first_party_crawler" };
    await db.collection("seo_audits").insertOne({ ...summary, ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain });
    await db.collection("seo_pages").insertMany(pages.map((page) => ({ ...page, ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, auditId, crawledAt: completedAt })));
    const findings = pages.flatMap((page) => page.issues.map((item) => ({ ...item, ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, auditId, pageUrl: page.url })));
    const issueCollection = db.collection("seo_issues");
    const newlyCritical: Array<{ title: string; pageUrl: string }> = [];
    for (const finding of findings) {
      const identity = { organizationId: site.organizationId, websiteDomain: domain, pageUrl: finding.pageUrl, ruleId: finding.ruleId };
      const existing = await issueCollection.findOne(identity, { projection: { _id: 1, status: 1, firstDetectedAt: 1 } });
      const reopened = existing && ["done", "resolved", "ignored"].includes(String(existing.status));
      const issueId = existing?._id ?? (await issueCollection.insertOne({
        ...finding,
        status: "open",
        firstDetectedAt: completedAt,
        lastDetectedAt: completedAt,
        detectionCount: 1,
        createdAt: completedAt,
      })).insertedId;
      if (existing) await issueCollection.updateOne(identity, { $set: { ...finding, status: reopened ? "open" : existing.status ?? "open", lastDetectedAt: completedAt }, $inc: { detectionCount: 1 } });
      if (finding.severity === "critical" && (!existing || reopened)) newlyCritical.push({ title: finding.title, pageUrl: finding.pageUrl });
      await db.collection("seo_issue_history").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, issueId, auditId, action: reopened ? "reopened" : "detected", evidence: finding.evidence, severity: finding.severity, detectedAt: completedAt });
    }
    await db.collection("seo_scores").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, auditId, score, version: summary.scoreVersion, components: scoreDetails.components, confidence: scoreDetails.confidence, scoredAt: completedAt });
    await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastAudit: summary, detectedCms, updatedAt: completedAt } });
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "seo.audit.completed", auditId, pageCount: pages.length, issueCount: findings.length, ...(detectedCms ? { detectedCms } : {}), createdAt: completedAt });
    const teammates = await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active", userId: { $ne: session.user.id } }, { projection: { userId: 1 } }).toArray();
    if (teammates.length) await db.collection("notifications").insertMany(teammates.map((member) => ({ userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "audit.completed", title: `Audit completed for ${domain}`, message: `${pages.length} pages scanned · ${findings.length} findings · SEO Health ${score}/100.`, auditId, createdAt: completedAt })));
    if (teammates.length && newlyCritical.length) await db.collection("notifications").insertMany(teammates.map((member) => ({ userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "audit.critical_issues", title: `${newlyCritical.length} new critical SEO issue${newlyCritical.length === 1 ? "" : "s"} for ${domain}`, message: newlyCritical.slice(0, 3).map((item) => `${item.title} (${item.pageUrl})`).join(" · "), auditId, createdAt: completedAt })));
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The crawl failed.";
    const completedAt = new Date();
    await db.collection("seo_audits").updateOne({ auditId }, { $set: { ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, status: "failed", error: message, completedAt }, $setOnInsert: { auditId, startedAt } }, { upsert: true });
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "seo.audit.failed", auditId, createdAt: new Date() });
    return NextResponse.json({ error: message }, { status: message === "No crawlable HTML pages were found." || message === "No score could be calculated." ? 422 : 502 });
  }
}
