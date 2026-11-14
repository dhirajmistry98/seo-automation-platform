import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { findAccessibleWebsite } from "@/lib/organizations";
import { auditHtml } from "@/lib/seo/audit";
import { fetchPublicHtml } from "@/lib/seo/crawler";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

// Rules that compare several pages can only be verified by a full crawl.
const CROSS_PAGE_RULES = new Set(["hreflang.return_missing", "internal.broken_link", "internal.not_linked_from_crawl", "internal.redirecting_link", "metadata.description_duplicate", "metadata.title_duplicate"]);

type Context = { params: Promise<{ domain: string }> };

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const severity = params.get("severity");
  const filter: Record<string, unknown> = { organizationId: website.organizationId, websiteDomain: domain };
  if (["open", "ignored", "resolved"].includes(status || "")) filter.status = status;
  if (["critical", "warning", "notice"].includes(severity || "")) filter.severity = severity;
  const issues = await db.collection("seo_issues").find(filter).sort({ severity: 1, lastDetectedAt: -1 }).limit(500).toArray();
  return NextResponse.json({ issues: issues.map((item) => ({ ...item, _id: String(item._id) })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<{ issueId?: unknown; action?: unknown }>(request, 4_096);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.issueId !== "string" || !ObjectId.isValid(body.issueId) || !["resolve", "ignore", "reopen"].includes(String(body.action))) return NextResponse.json({ error: "Provide a valid issue ID and action." }, { status: 400 });
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "issues.manage");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const issueFilter = { _id: new ObjectId(body.issueId), organizationId: website.organizationId, websiteDomain: domain };
  const issue = await db.collection("seo_issues").findOne(issueFilter);
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const now = new Date();
  let status: string;
  let verifiedByAuditId: string | null = null;
  if (body.action === "resolve") {
    if (!CROSS_PAGE_RULES.has(String(issue.ruleId))) {
      // Re-check the live page now instead of waiting for the next crawl.
      let livePage;
      try {
        const fetched = await fetchPublicHtml(String(issue.pageUrl), domain);
        const primaryKeywords = Array.isArray(website.primaryKeywords) ? website.primaryKeywords.filter((keyword: unknown): keyword is string => typeof keyword === "string") : undefined;
        livePage = auditHtml(String(issue.pageUrl), fetched.finalUrl, 200, fetched.html, fetched.headers, { primaryKeywords });
      } catch (caught) {
        return NextResponse.json({ error: `Could not check the live page: ${caught instanceof Error ? caught.message : "request failed"}` }, { status: 409 });
      }
      const stillPresent = livePage.issues.find((item) => item.ruleId === issue.ruleId);
      if (stillPresent) return NextResponse.json({ error: `Still detected on the live page${stillPresent.evidence ? ` (${stillPresent.evidence})` : ""}. Publish your fix, then verify again.` }, { status: 409 });
      status = "resolved";
      verifiedByAuditId = "live-check";
    } else {
      const latestAudit = await db.collection("seo_audits").find({ organizationId: website.organizationId, websiteDomain: domain, status: "completed" }).sort({ completedAt: -1 }).limit(1).next();
      if (!latestAudit || new Date(latestAudit.completedAt).getTime() <= new Date(issue.lastDetectedAt ?? issue.firstDetectedAt).getTime()) return NextResponse.json({ error: "This issue compares several pages, so it needs a new site audit. Run a site audit after fixing it, then verify again." }, { status: 409 });
      const auditedPage = await db.collection("seo_pages").findOne({ organizationId: website.organizationId, websiteDomain: domain, auditId: latestAudit.auditId, url: issue.pageUrl }, { projection: { issues: 1 } });
      if (!auditedPage) return NextResponse.json({ error: "The affected URL was not included in the latest audit." }, { status: 409 });
      if ((auditedPage.issues ?? []).some((item: { ruleId?: string }) => item.ruleId === issue.ruleId)) return NextResponse.json({ error: "The latest audit still detects this issue." }, { status: 409 });
      status = "resolved";
      verifiedByAuditId = latestAudit.auditId;
    }
  } else {
    status = body.action === "ignore" ? "ignored" : "open";
  }
  await db.collection("seo_issues").updateOne(issueFilter,
    { $set: { status, updatedAt: now, ...(status === "resolved" ? { resolvedAt: now, resolvedBy: session.user.id, verificationAuditId: verifiedByAuditId } : {}), ...(body.action === "reopen" ? { reopenedAt: now } : {}) },
      ...(status !== "resolved" ? { $unset: { resolvedAt: "", resolvedBy: "", verificationAuditId: "" } } : {}) });
  await db.collection("seo_issue_history").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, issueId: issue._id, action: status, actorId: session.user.id, verifiedByAuditId, changedAt: now });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, action: `seo.issue.${status}`, issueId: String(issue._id), verificationAuditId: verifiedByAuditId, createdAt: now });
  return NextResponse.json({ updated: true, status, verifiedByAuditId });
}
