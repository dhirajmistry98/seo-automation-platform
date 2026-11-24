import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { analyzeData } from "@/lib/ai/data-insights";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { StoredSearchReport } from "@/lib/dashboard/overview";

export const maxDuration = 45;
type Context = { params: Promise<{ domain: string }> };
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra?: Record<string, string>) => NextResponse.json({ error }, { status, headers: { ...headers, ...extra } });

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return fail("Website not found.", 404);

  const limit = await consumeRateLimit(db, "data-insights", session.user.id, 6, 60_000);
  if (!limit.allowed) return fail("Too many analyses. Please wait a moment.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ pasted?: unknown }>(request, 60_000);
  if (!parsed.ok) return fail(parsed.status === 413 ? "That paste is too large. Keep it under 40,000 characters." : "Invalid request.", parsed.status);
  const pasted = typeof parsed.value.pasted === "string" ? parsed.value.pasted.replace(/\u0000/g, "").trim().slice(0, 40_000) : "";
  if (pasted.length < 10) return fail("Paste some data to analyze, such as keywords or a Search Console export.", 400);

  const scope = { organizationId: website.organizationId, websiteDomain: domain };
  const [report, pages] = await Promise.all([
    db.collection<StoredSearchReport>("google_search_console_reports").find({ ...scope, dimension: "query" }).sort({ generatedAt: -1 }).limit(1).toArray(),
    db.collection("seo_pages").find(scope, { projection: { url: 1, title: 1 } }).sort({ crawledAt: -1 }).limit(60).toArray(),
  ]);
  const queries = (report[0]?.rows || []).slice(0, 80).flatMap((row) => row.keys?.[0] ? [{ query: String(row.keys[0]).slice(0, 120), clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, position: Number(row.position) || 0 }] : []);

  try {
    const analysis = await analyzeData({ domain, pasted, queries, pages: pages.map((p) => ({ url: String(p.url || "").slice(0, 200), title: String(p.title || "").slice(0, 120) })) });
    if (!analysis) return fail("No analysis was returned. Please try again.", 502);
    return NextResponse.json({ analysis, usedConnectedData: queries.length > 0, pagesCompared: pages.length }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === "not-configured") return fail("AI analysis is not configured yet.", 503);
    console.error("data-insights failed", error instanceof Error ? error.message : "unknown");
    return fail("The analysis is unavailable right now. Please try again shortly.", 502);
  }
}
