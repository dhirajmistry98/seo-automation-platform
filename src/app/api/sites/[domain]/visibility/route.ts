import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { analyzeSearchVisibility } from "@/lib/seo/search-visibility";

type Context = { params: Promise<{ domain: string }> };
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return fail("Website not found.", 404);
  const reports = await db.collection("seo_visibility_reports")
    .find({ organizationId: website.organizationId, websiteDomain: domain })
    .sort({ calculatedAt: -1 }).limit(12)
    .project({ _id: 0, version: 1, pageCount: 1, scores: 1, dimensions: 1, recommendations: 1, limitations: 1, crawlerAccess: 1, sourceAuditId: 1, sourceAuditCompletedAt: 1, calculatedAt: 1 })
    .toArray();
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return fail("Website not found or research access is not allowed.", 404);
  const limit = await consumeRateLimit(db, "search-visibility", `${String(website.organizationId)}:${domain}`, 12, 24 * 60 * 60_000);
  if (!limit.allowed) return fail("Search visibility analysis reached its daily limit. Try again tomorrow.", 429);

  const audit = await db.collection("seo_audits").findOne(
    { organizationId: website.organizationId, websiteDomain: domain, status: "completed" },
    { sort: { completedAt: -1 }, projection: { auditId: 1, completedAt: 1, searchAccess: 1 } },
  );
  if (!audit || typeof audit.auditId !== "string") return fail("Run a site crawl before analyzing GEO, AEO and LLMO readiness.", 409);
  const pages = await db.collection("seo_pages").find(
    { organizationId: website.organizationId, websiteDomain: domain, auditId: audit.auditId },
    { projection: { _id: 0, url: 1, status: 1, title: 1, description: 1, robots: 1, headings: 1, wordCount: 1, externalLinks: 1, structuredData: 1, searchSignals: 1 } },
  ).limit(100).toArray();
  if (!pages.length) return fail("The latest crawl has no saved page data. Run the crawl again and retry.", 409);

  const report = analyzeSearchVisibility(pages, audit.searchAccess);
  const calculatedAt = new Date();
  const snapshot = {
    ...report,
    ownerId: session.user.id,
    organizationId: website.organizationId,
    websiteDomain: domain,
    sourceAuditId: audit.auditId,
    sourceAuditCompletedAt: audit.completedAt,
    calculatedAt,
  };
  const inserted = await db.collection("seo_visibility_reports").insertOne(snapshot);
  await db.collection("audit_logs").insertOne({
    ownerId: session.user.id,
    organizationId: website.organizationId,
    websiteDomain: domain,
    actorId: session.user.id,
    action: "seo.search_visibility.analyzed",
    reportId: inserted.insertedId,
    sourceAuditId: audit.auditId,
    pageCount: report.pageCount,
    scores: report.scores,
    createdAt: calculatedAt,
  });
  return NextResponse.json({ report: { ...report, sourceAuditId: audit.auditId, sourceAuditCompletedAt: audit.completedAt, calculatedAt } }, { headers: { "Cache-Control": "no-store" } });
}
