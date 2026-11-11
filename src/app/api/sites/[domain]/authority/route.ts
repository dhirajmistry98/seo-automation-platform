import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { AUTHORITY_INDEX_VERSION, calculateAuthorityIndex } from "@/lib/seo/authority-index";
import { ensureSeoIndexes } from "@/lib/seo/indexes";

type Context = { params: Promise<{ domain: string }> };
const fail = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return fail("Website not found.", 404);
  const snapshots = await db.collection("seo_authority_scores")
    .find({ organizationId: website.organizationId, websiteDomain: domain })
    .sort({ calculatedAt: -1 }).limit(24)
    .project({ _id: 0, score: 1, confidence: 1, components: 1, inputs: 1, sourceDates: 1, version: 1, calculatedAt: 1 })
    .toArray();
  return NextResponse.json({ snapshots, methodology: AUTHORITY_INDEX_VERSION, disclaimer: "SEO Studio estimate based on connected data; it is not a Google metric." }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return fail("Website not found.", 404);
  const limit = await consumeRateLimit(db, "authority-index", String(website.organizationId) + ":" + domain, 10, 24 * 60 * 60_000);
  if (!limit.allowed) return fail("Authority Index calculation limit reached. Try again later.", 429);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000);
  const scope = { organizationId: website.organizationId, websiteDomain: domain };
  const [backlinks, searchQueries, audit] = await Promise.all([
    db.collection("seo_research_reports").findOne({ ...scope, kind: "backlinks", fetchedAt: { $gte: ninetyDaysAgo } }, { sort: { fetchedAt: -1 }, projection: { result: 1, fetchedAt: 1 } }),
    db.collection("google_search_console_reports").findOne({ ...scope, dimension: "query", generatedAt: { $gte: ninetyDaysAgo } }, { sort: { generatedAt: -1 }, projection: { rows: 1, generatedAt: 1 } }),
    db.collection("seo_audits").findOne({ ...scope, status: "completed", completedAt: { $gte: ninetyDaysAgo } }, { sort: { completedAt: -1 }, projection: { auditId: 1, completedAt: 1 } }),
  ]);
  const pages = audit ? await db.collection("seo_pages").find({ ...scope, auditId: audit.auditId })
    .limit(100).project({ _id: 0, status: 1, finalUrl: 1, url: 1, robots: 1 }).toArray() : [];
  const result = calculateAuthorityIndex({
    backlinks: Array.isArray(backlinks?.result) && backlinks.result[0] && typeof backlinks.result[0] === "object" ? backlinks.result[0] : null,
    searchQueries: Array.isArray(searchQueries?.rows) ? searchQueries.rows.slice(0, 250) : null,
    pages,
    primaryKeywords: Array.isArray(website.primaryKeywords) ? website.primaryKeywords.filter((item): item is string => typeof item === "string") : [],
  });
  if (result.score === null) return fail("Recent source data is incomplete. Run a backlink summary, a Search Console query report, and a site audit, then set primary keywords.", 409, { missing: result.missing });
  const calculatedAt = new Date();
  const snapshot = {
    ownerId: session.user.id,
    organizationId: website.organizationId,
    websiteDomain: domain,
    ...result,
    sourceDates: { backlinks: backlinks?.fetchedAt, searchQueries: searchQueries?.generatedAt, crawl: audit?.completedAt },
    calculatedAt,
  };
  const insert = await db.collection("seo_authority_scores").insertOne(snapshot);
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, actorId: session.user.id, action: "seo.authority_index.calculated", score: result.score, confidence: result.confidence, version: result.version, createdAt: calculatedAt });
  return NextResponse.json({ snapshot: { id: String(insert.insertedId), score: result.score, confidence: result.confidence, components: result.components, inputs: result.inputs, sourceDates: snapshot.sourceDates, version: result.version, calculatedAt } }, { headers: { "Cache-Control": "no-store" } });
}
