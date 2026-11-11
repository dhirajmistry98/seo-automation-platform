import type { Db, Document } from "mongodb";
import { getHealthScoreDetails } from "./audit";
import type { AuditedPage } from "./audit";
import type { SearchCrawlerAccess } from "./search-access";

export async function persistCrawlResult(input: {
  db: Db;
  site: Document;
  ownerId: string;
  auditId: string;
  pages: AuditedPage[];
  skippedByRobots: number;
  failedPages: number;
  searchAccess: SearchCrawlerAccess;
  startedAt: Date;
}) {
  const { db, site, ownerId, auditId, pages, skippedByRobots, failedPages, searchAccess, startedAt } = input;
  const domain = String(site.domain);
  if (!pages.length) throw new Error("No crawlable HTML pages were found.");
  const scoreDetails = getHealthScoreDetails(pages);
  if (!scoreDetails) throw new Error("No score could be calculated.");
  const issueCounts = pages.flatMap((page) => page.issues).reduce((counts, item) => {
    counts[item.severity]++;
    return counts;
  }, { critical: 0, warning: 0, notice: 0 });
  const cmsCandidates = pages.flatMap((page) => page.cmsDetection ? [page.cmsDetection] : []);
  const cmsGroups = cmsCandidates.reduce((groups, item) => groups.set(item.name, [...(groups.get(item.name) ?? []), item]), new Map<string, typeof cmsCandidates>());
  const detectedCms = [...cmsGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[1][0] ?? null;
  const completedAt = new Date();
  const summary = { auditId, status: "completed", score: scoreDetails.score, components: scoreDetails.components, confidence: scoreDetails.confidence, confidenceNote: scoreDetails.confidenceNote, pageCount: pages.length, issueCounts, skippedByRobots, failedPages, detectedCms, searchAccess, startedAt, completedAt, scoreVersion: "seo-health-v1", source: "first_party_crawler" };
  const siteData = { ownerId, organizationId: site.organizationId, websiteDomain: domain };
  await db.collection("seo_pages").bulkWrite(pages.map((page) => ({
    updateOne: {
      filter: { ...siteData, auditId, url: page.url },
      update: { $setOnInsert: { ...page, ...siteData, auditId, crawledAt: completedAt } },
      upsert: true,
    },
  })), { ordered: false });
  await db.collection("seo_audits").updateOne({ auditId }, { $set: { ...summary, ...siteData }, $setOnInsert: { createdAt: startedAt } }, { upsert: true });
  const findings = pages.flatMap((page) => page.issues.map((item) => ({ ...item, ...siteData, auditId, pageUrl: page.url })));
  const newlyCritical: Array<{ title: string; pageUrl: string }> = [];
  const tasks = db.collection("seo_tasks");
  let tasksCreated = 0;
  let tasksReopened = 0;
  const issueCollection = db.collection("seo_issues");
  for (const finding of findings) {
    const identity = { organizationId: site.organizationId, websiteDomain: domain, pageUrl: finding.pageUrl, ruleId: finding.ruleId };
    const existing = await issueCollection.findOne(identity, { projection: { _id: 1, status: 1 } });
    const priorEvent = existing ? await db.collection("seo_issue_history").findOne({ auditId, issueId: existing._id }, { projection: { action: 1 } }) : null;
    const reopened = Boolean(existing && (["done", "resolved", "ignored"].includes(String(existing.status)) || priorEvent?.action === "reopened"));
    const issueId = existing?._id ?? (await issueCollection.insertOne({ ...finding, status: "open", firstDetectedAt: completedAt, lastDetectedAt: completedAt, detectionCount: 1, createdAt: completedAt })).insertedId;
    if (existing && !priorEvent) {
      await issueCollection.updateOne(identity, { $set: { ...finding, status: reopened ? "open" : existing.status ?? "open", lastDetectedAt: completedAt }, $inc: { detectionCount: 1 } });
    }
    if (finding.severity === "critical" && (!existing || reopened)) newlyCritical.push({ title: finding.title, pageUrl: finding.pageUrl });
    await db.collection("seo_issue_history").updateOne({ auditId, issueId, action: reopened ? "reopened" : "detected" }, { $setOnInsert: { ...siteData, issueId, auditId, action: reopened ? "reopened" : "detected", evidence: finding.evidence, severity: finding.severity, detectedAt: completedAt } }, { upsert: true });

    // Every open finding from a completed crawl gets one actionable task. The
    // source issue ID makes retries idempotent and preserves task history.
    const sourceIssueId = String(issueId);
    const task = await tasks.findOne({ organizationId: site.organizationId, websiteDomain: domain, sourceIssueId });
    const now = new Date();
    if (task) {
      if (reopened && task.status === "done") {
        await tasks.updateOne({ _id: task._id, status: "done" }, { $set: { status: "todo", auditId, completedAt: null, updatedAt: now } });
        await db.collection("seo_task_history").updateOne({ taskId: task._id, auditId, action: "reopened_from_new_audit" }, { $setOnInsert: { ...siteData, taskId: task._id, sourceIssueId, auditId, action: "reopened_from_new_audit", changedAt: now } }, { upsert: true });
        tasksReopened++;
      }
    } else {
      const created = await tasks.updateOne({ organizationId: site.organizationId, websiteDomain: domain, sourceIssueId }, { $setOnInsert: { ...siteData, sourceIssueId, auditId, title: finding.title, description: finding.recommendation, severity: finding.severity, pageUrl: finding.pageUrl, status: "todo", createdAt: now, updatedAt: now } }, { upsert: true });
      if (created.upsertedId) {
        tasksCreated++;
        await db.collection("seo_task_history").updateOne({ taskId: created.upsertedId, auditId, action: "created_from_issue" }, { $setOnInsert: { ...siteData, taskId: created.upsertedId, sourceIssueId, auditId, action: "created_from_issue", changedAt: now } }, { upsert: true });
      }
    }
  }
  await db.collection("seo_scores").updateOne({ ownerId, websiteDomain: domain, auditId }, { $set: { ...siteData, auditId, score: scoreDetails.score, version: summary.scoreVersion, components: scoreDetails.components, confidence: scoreDetails.confidence, scoredAt: completedAt } }, { upsert: true });
  await db.collection("websites").updateOne({ _id: site._id }, { $set: { lastAudit: summary, detectedCms, updatedAt: completedAt } });
  await db.collection("audit_logs").updateOne({ ownerId, websiteDomain: domain, auditId, action: "seo.audit.completed" }, { $setOnInsert: { ...siteData, action: "seo.audit.completed", auditId, pageCount: pages.length, issueCount: findings.length, ...(detectedCms ? { detectedCms } : {}), createdAt: completedAt } }, { upsert: true });
  const teammates = site.organizationId ? await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active", userId: { $ne: ownerId } }, { projection: { userId: 1 } }).toArray() : [];
  for (const member of teammates) {
    await db.collection("notifications").updateOne({ userId: member.userId, auditId, type: "audit.completed" }, { $setOnInsert: { userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "audit.completed", title: `Audit completed for ${domain}`, message: `${pages.length} pages scanned · ${findings.length} findings · SEO Health ${scoreDetails.score}/100.`, auditId, createdAt: completedAt } }, { upsert: true });
    if (newlyCritical.length) await db.collection("notifications").updateOne({ userId: member.userId, auditId, type: "audit.critical_issues" }, { $setOnInsert: { userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "audit.critical_issues", title: `${newlyCritical.length} new critical SEO issue${newlyCritical.length === 1 ? "" : "s"} for ${domain}`, message: newlyCritical.slice(0, 3).map((item) => `${item.title} (${item.pageUrl})`).join(" · "), auditId, createdAt: completedAt } }, { upsert: true });
  }
  return { ...summary, tasksCreated, tasksReopened };
}
