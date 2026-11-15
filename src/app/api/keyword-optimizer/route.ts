import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { auditHtml } from "@/lib/seo/audit";
import { fetchPublicHtml } from "@/lib/seo/crawler";
import { analyzeKeywordTargeting } from "@/lib/seo/keyword-optimizer";
import { QUESTION_PREFIXES, fetchKeywordMetrics, googleSuggest, searchConsoleLookup } from "@/lib/integrations/free-research";
import { findAccessibleWebsite } from "@/lib/organizations";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: noStore });

function parseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}

type GoogleStatus = "ranking" | "not_ranking" | "not_connected" | "no_property" | "api_error" | "not_your_site";
/** Google position for the keyword, with an explicit status so the UI never shows an unexplained blank. */
async function googleRanking(lookup: Awaited<ReturnType<typeof searchConsoleLookup>> | null, keyword: string, finalUrl: string, host: string) {
  const empty = { position: null as number | null, impressions: 0, clicks: 0, rankingPage: null as string | null, samePage: null as boolean | null };
  const result = (status: GoogleStatus, message: string, extra: Partial<typeof empty> = {}) => ({ connected: status === "ranking" || status === "not_ranking", status, message, ...empty, ...extra });
  if (!lookup) return result("not_your_site", `${host} is not one of your websites. Add and verify it to see its Google position.`);
  if (lookup.status !== "ok") return result(lookup.status, lookup.message);
  const fetched = await fetchKeywordMetrics(lookup.context, keyword);
  if ("error" in fetched) return result("api_error", fetched.error);
  const google = fetched.metrics;
  if (!google.impressions) return result("not_ranking", `No Google impressions for “${keyword}” in the last 28 days.`);
  const samePage = google.page ? new URL(google.page).pathname.replace(/\/+$/, "") === new URL(finalUrl).pathname.replace(/\/+$/, "") : null;
  return result("ranking", `Average position over the last 28 days.`, { position: google.position, impressions: google.impressions, clicks: google.clicks, rankingPage: google.page, samePage });
}

/** GET: this user's saved keyword targets with their score/position history. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const db = (await clientPromise).db();
  const targets = await db.collection("keyword_targets").find({ userId: session.user.id }, { projection: { _id: 0, url: 1, keyword: 1, history: { $slice: -12 }, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(30).toArray();
  return NextResponse.json({ targets }, { headers: noStore });
}

/** POST { url, keyword }: analyze how well a live page targets a keyword and how to rank higher for it. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Sign in to optimize a page.", 401);
  const parsed = await readJsonLimited<{ url?: unknown; keyword?: unknown }>(request, 4_096);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const url = parseUrl(parsed.value.url);
  if (!url) return fail("Enter the full address of the page you want to rank, e.g. https://example.com/services.");
  const keyword = typeof parsed.value.keyword === "string" ? parsed.value.keyword.trim().replace(/\s+/g, " ") : "";
  if (keyword.length < 2 || keyword.length > 100) return fail("Enter the keyword you want this page to rank for (2–100 characters).");

  const db = (await clientPromise).db();
  const limit = await consumeRateLimit(db, "keyword-optimizer", session.user.id, 30, 60 * 60_000);
  if (!limit.allowed) return fail(`You have run 30 analyses this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`, 429);

  // Use the workspace website's market settings and Search Console when the user owns this domain.
  const host = url.hostname.toLowerCase();
  const { website } = await findAccessibleWebsite(db, session.user.id, host.replace(/^www\./, ""), "reports.read").catch(() => ({ website: null }));
  const fallbackSite = website ?? (host.startsWith("www.") ? null : (await findAccessibleWebsite(db, session.user.id, `www.${host}`, "reports.read").catch(() => ({ website: null }))).website);
  const site = website ?? fallbackSite;
  const language = typeof site?.rankTrackingLanguageCode === "string" ? site.rankTrackingLanguageCode : "en";
  const country = typeof site?.rankTrackingCountryCode === "string" ? site.rankTrackingCountryCode : "IN";

  let html: string; let finalUrl: string; let headers: Headers;
  try { ({ html, finalUrl, headers } = await fetchPublicHtml(url.href, host)); }
  catch (error) { return fail(`Could not read that page: ${error instanceof Error ? error.message : "request failed"}`, 422); }

  try {
    const page = auditHtml(url.href, finalUrl, 200, html, headers, { primaryKeywords: [keyword] });
    const [related, questionBatches, gscLookup] = await Promise.all([
      googleSuggest(keyword, language, country),
      Promise.all(QUESTION_PREFIXES.slice(0, 7).map((prefix) => googleSuggest(`${prefix} ${keyword}`, language, country))),
      site ? searchConsoleLookup(db, site.organizationId, String(site.domain)) : Promise.resolve(null),
    ]);
    const relatedSearches = [...new Set(related.filter((item) => item.toLowerCase() !== keyword.toLowerCase()))].slice(0, 10);
    const questions = [...new Set(questionBatches.flat().filter((item) => /^(what|how|why|which|where|when|who|can|is|does|should|are)\b/i.test(item)))].slice(0, 10);
    const analysis = analyzeKeywordTargeting(page, html, keyword, relatedSearches, questions);
    const googleResult = await googleRanking(gscLookup, keyword, finalUrl, host);
    const now = new Date();
    await db.collection("keyword_targets").updateOne(
      { userId: session.user.id, url: finalUrl, keyword: keyword.toLowerCase() },
      { $set: { updatedAt: now, organizationId: site?.organizationId ?? null }, $setOnInsert: { createdAt: now }, $push: { history: { $each: [{ at: now, score: analysis.score, position: googleResult.position, googleStatus: googleResult.status, googleMessage: googleResult.message }], $slice: -60 } } } as never,
      { upsert: true },
    );
    return NextResponse.json({ url: finalUrl, keyword, checkedAt: now.toISOString(), market: { language, country }, google: googleResult, relatedSearches, questions, ...analysis }, { headers: noStore });
  } catch (error) {
    console.error("Keyword optimizer failed:", error);
    return fail("The analysis failed. Please try again.", 502);
  }
}
