import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { findAccessibleWebsite } from "@/lib/organizations";

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request, context: { params: Promise<{ domain: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const [audits, scores, authorityScores, visibilityReports, issues, tasks, pageSpeed, research, searchConsole, analytics, merchantCenter, businessProfile] = await Promise.all([
    db.collection("seo_audits").find({ organizationId: website.organizationId, websiteDomain: domain, status: "completed" }).sort({ completedAt: -1 }).limit(20).project({ _id: 0, auditId: 1, score: 1, pageCount: 1, issueCounts: 1, confidence: 1, scoreVersion: 1, completedAt: 1, source: 1, searchAccess: 1 }).toArray(),
    db.collection("seo_scores").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ scoredAt: -1 }).limit(100).project({ _id: 0, score: 1, version: 1, components: 1, confidence: 1, scoredAt: 1 }).toArray(),
    db.collection("seo_authority_scores").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ calculatedAt: -1 }).limit(100).project({ _id: 0, score: 1, confidence: 1, components: 1, inputs: 1, sourceDates: 1, version: 1, calculatedAt: 1 }).toArray(),
    db.collection("seo_visibility_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ calculatedAt: -1 }).limit(100).project({ _id: 0, version: 1, pageCount: 1, scores: 1, dimensions: 1, recommendations: 1, limitations: 1, crawlerAccess: 1, sourceAuditId: 1, sourceAuditCompletedAt: 1, calculatedAt: 1 }).toArray(),
    db.collection("seo_issues").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ severity: 1, lastDetectedAt: -1 }).limit(500).project({ _id: 0, ruleId: 1, title: 1, severity: 1, status: 1, pageUrl: 1, evidence: 1, recommendation: 1, firstDetectedAt: 1, lastDetectedAt: 1, resolvedAt: 1 }).toArray(),
    db.collection("seo_tasks").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ createdAt: -1 }).limit(500).project({ _id: 0, title: 1, severity: 1, status: 1, pageUrl: 1, createdAt: 1, completedAt: 1 }).toArray(),
    db.collection("pagespeed_results").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ retrievedAt: -1 }).limit(20).project({ _id: 0, url: 1, strategy: 1, categories: 1, labMetrics: 1, fieldMetrics: 1, fieldDataStatus: 1, source: 1, retrievedAt: 1 }).toArray(),
    db.collection("seo_research_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ fetchedAt: -1 }).limit(100).project({ _id: 0, kind: 1, query: 1, locationCode: 1, locationName: 1, countryCode: 1, countryName: 1, countryLocationCode: 1, languageCode: 1, device: 1, provider: 1, source: 1, result: 1, fetchedAt: 1 }).toArray(),
    db.collection("google_search_console_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ generatedAt: -1 }).limit(50).project({ _id: 0, property: 1, dimension: 1, startDate: 1, endDate: 1, rowCount: 1, rows: 1, generatedAt: 1, source: 1 }).toArray(),
    db.collection("google_analytics_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ generatedAt: -1 }).limit(50).project({ _id: 0, propertyId: 1, report: 1, generatedAt: 1, source: 1 }).toArray(),
    db.collection("google_merchant_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ generatedAt: -1 }).limit(50).project({ _id: 0, accountId: 1, startDate: 1, endDate: 1, report: 1, generatedAt: 1, source: 1 }).toArray(),
    db.collection("google_business_profile_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ generatedAt: -1 }).limit(50).project({ _id: 0, locationName: 1, startDate: 1, endDate: 1, report: 1, generatedAt: 1, source: 1 }).toArray(),
  ]);
  const pages = await db.collection("seo_pages")
    .find({ organizationId: website.organizationId, websiteDomain: domain, auditId: { $in: audits.map((item) => item.auditId) } })
    .sort({ crawledAt: -1 }).limit(500)
    .project({ _id: 0, auditId: 1, url: 1, finalUrl: 1, status: 1, title: 1, description: 1, canonical: 1, robots: 1, headings: 1, wordCount: 1, internalLinks: 1, externalLinks: 1, images: 1, structuredData: 1, cmsDetection: 1, healthScore: 1, issues: 1, crawledAt: 1 })
    .toArray();
  const ownerId = typeof website.ownerId === "string" ? website.ownerId : session.user.id;
  const activityFilter = website.organizationId
    ? { websiteDomain: domain, $or: [{ organizationId: website.organizationId }, { organizationId: { $exists: false }, ownerId }] }
    : { websiteDomain: domain, ownerId };
  const activity = await db.collection("audit_logs").find(activityFilter)
    .sort({ createdAt: -1 }).limit(1000)
    .project({ _id: 0, action: 1, method: 1, auditId: 1, pageCount: 1, issueCount: 1, removed: 1, detectedCms: 1, createdAt: 1 })
    .toArray();
  const siteSettings = {
    domain: website.domain, url: website.url, name: website.name, websiteType: website.websiteType,
    businessCategory: website.businessCategory, targetCountry: website.targetCountry, targetLanguage: website.targetLanguage,
    timeZone: website.timeZone, primaryKeywords: website.primaryKeywords, competitorDomains: website.competitorDomains,
    sitemapUrl: website.sitemapUrl, robotsUrl: website.robotsUrl, crawlFrequency: website.crawlFrequency, pageSpeedFrequency: website.pageSpeedFrequency, nextScheduledPageSpeedAt: website.nextScheduledPageSpeedAt, rankTrackingFrequency: website.rankTrackingFrequency, rankTrackingLocationCode: website.rankTrackingLocationCode, rankTrackingLocationName: website.rankTrackingLocationName, rankTrackingCountryCode: website.rankTrackingCountryCode, rankTrackingCountryName: website.rankTrackingCountryName, rankTrackingCountryLocationCode: website.rankTrackingCountryLocationCode, rankTrackingLanguageCode: website.rankTrackingLanguageCode, rankTrackingDevice: website.rankTrackingDevice, nextScheduledRankTrackingAt: website.nextScheduledRankTrackingAt,
    maxPages: website.maxPages, active: website.active, verifiedAt: website.verifiedAt,
    verificationMethod: website.verificationMethod, detectedCms: website.detectedCms, createdAt: website.createdAt,
  };
  const report = { domain, generatedAt: new Date(), source: "SEO Studio stored provider and crawler records", website: siteSettings, audits, scoreHistory: scores, authorityHistory: authorityScores, searchVisibilityHistory: visibilityReports, pages, issues, tasks, activity, pageSpeed, keywordResearch: research, searchConsole, analytics, merchantCenter, businessProfile };
  if (new URL(request.url).searchParams.get("format") !== "csv") {
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (new URL(request.url).searchParams.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="${domain}-seo-data.json"`);
    return NextResponse.json(report, { headers });
  }
  const headers = ["type", "date", "score", "severity", "status", "title", "url", "evidence", "recommendation"];
  const rows = [headers, ...audits.map((item) => ["audit", item.completedAt, item.score, "", "completed", `${item.pageCount} pages`, domain, JSON.stringify(item.issueCounts), item.scoreVersion]), ...visibilityReports.map((item) => ["search_visibility", item.calculatedAt, "", "", "completed", `${item.pageCount} pages · GEO ${item.scores?.geo ?? "—"} · AEO ${item.scores?.aeo ?? "—"} · LLMO ${item.scores?.llmo ?? "—"}`, domain, JSON.stringify(item.recommendations), item.version]), ...pages.map((item) => ["page", item.crawledAt, item.healthScore?.score ?? "", "", "crawled", item.title, item.url, JSON.stringify({ wordCount: item.wordCount, cmsDetection: item.cmsDetection }), item.auditId]), ...issues.map((item) => ["issue", item.lastDetectedAt, "", item.severity, item.status, item.title, item.pageUrl, item.evidence, item.recommendation]), ...tasks.map((item) => ["task", item.createdAt, "", item.severity, item.status, item.title, item.pageUrl, "", item.completedAt]), ...research.map((item) => ["seo_research", item.fetchedAt, "", "", item.kind, item.query, domain, JSON.stringify({ locationCode: item.locationCode, locationName: item.locationName, countryCode: item.countryCode, countryName: item.countryName, countryLocationCode: item.countryLocationCode, languageCode: item.languageCode, device: item.device, provider: item.provider, result: item.result }), "DataForSEO"]), ...searchConsole.flatMap((item) => Array.isArray(item.rows) ? item.rows.map((row: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }) => ["search_console", item.generatedAt, "", "", "", `${item.dimension}: ${row.keys?.join(" · ") || ""}`, item.property, JSON.stringify({ clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }), `${item.startDate} – ${item.endDate}`]) : []), ...analytics.flatMap((item) => Array.isArray(item.report?.rows) ? item.report.rows.map((row: { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }) => ["analytics", item.generatedAt, "", "", "", row.dimensionValues?.map((v) => v.value).join(" · ") || "", item.propertyId, row.metricValues?.map((v) => v.value).join(" · ") || "", "GA4"]) : [])];
  const csv = [rows.map((row) => row.map(csvCell).join(",")).join("\r\n")].join("");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${domain}-seo-report.csv"`, "Cache-Control": "no-store" } });
}
