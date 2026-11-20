import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { searchConsoleContext } from "@/lib/integrations/free-research";
import { googleApiError } from "@/lib/integrations/google";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ domain: string }> };

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const issueId = new URL(request.url).searchParams.get("issueId") ?? "";
  if (!issueId || !ObjectId.isValid(issueId)) return NextResponse.json({ error: "Provide a valid issue ID." }, { status: 400 });

  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  // Each check makes a live GSC API call — cap at 30 per hour per workspace.
  const rateLimit = await consumeRateLimit(db, "fix-impact", String(website.organizationId), 30, 60 * 60_000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "Too many rank checks. Try again in an hour." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } });

  const issue = await db.collection("seo_issues").findOne(
    { _id: new ObjectId(issueId), organizationId: website.organizationId, websiteDomain: domain },
    { projection: { pageUrl: 1, status: 1, resolvedAt: 1, rankAtResolution: 1 } },
  );
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });

  type SnapshotKeyword = { query: string; position: number; impressions: number };
  const snapshot = issue.rankAtResolution as { snapshotDate: string; keywords: SnapshotKeyword[] } | undefined;
  if (!snapshot?.keywords?.length) {
    return NextResponse.json({ noSnapshot: true, message: "No ranking snapshot was captured at resolution time (Search Console may not have been connected)." });
  }

  const gscCtx = await searchConsoleContext(db, website.organizationId, domain);
  if (!gscCtx) return NextResponse.json({ error: "Search Console is not connected. Reconnect Google Search Console to check current rankings." }, { status: 503 });

  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 27 * 86_400_000);
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscCtx.property)}/searchAnalytics/query`;

  // Fetch current rankings for all snapshot keywords in one batch
  let currentRows: Array<{ query: string; position: number; impressions: number }> = [];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${gscCtx.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query"],
        dimensionFilterGroups: [{
          filters: [{ dimension: "page", operator: "equals", expression: String(issue.pageUrl) }],
        }],
        rowLimit: 25,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const errMsg = await googleApiError(response, "Search Console data could not be read.");
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }
    type GscRow = { keys?: string[]; position?: number; impressions?: number };
    const payload = await response.json() as { rows?: GscRow[] };
    currentRows = (payload.rows ?? []).map((row) => ({
      query: row.keys?.[0] ?? "",
      position: Math.round((row.position ?? 0) * 10) / 10,
      impressions: row.impressions ?? 0,
    })).filter((r) => r.query);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search Console did not respond." }, { status: 503 });
  }

  // Merge snapshot keywords with current positions
  const currentByQuery = new Map(currentRows.map((r) => [r.query, r]));
  const keywords = snapshot.keywords.map((k) => {
    const now = currentByQuery.get(k.query);
    const positionNow = now?.position ?? null;
    const delta = positionNow !== null ? Math.round((k.position - positionNow) * 10) / 10 : null; // positive = improved
    return {
      query: k.query,
      positionBefore: k.position,
      impressionsBefore: k.impressions,
      positionNow,
      impressionsNow: now?.impressions ?? null,
      delta,
      improved: delta !== null && delta > 0.5,
      dropped: delta !== null && delta < -0.5,
    };
  });

  return NextResponse.json({
    snapshotDate: snapshot.snapshotDate,
    resolvedAt: issue.resolvedAt instanceof Date ? issue.resolvedAt.toISOString() : String(issue.resolvedAt ?? ""),
    pageUrl: String(issue.pageUrl ?? ""),
    keywords,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
