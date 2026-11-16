import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { auditHtml } from "@/lib/seo/audit";
import { fetchPublicHtml, safeGet } from "@/lib/seo/crawler";
import { benchmarkPage, missingTopics as serpMissingTopics, pageProfile, parseSerp, type PageProfile, type SerpResult } from "@/lib/seo/serp-benchmark";
import { visiblePageText } from "@/lib/seo/keyword-optimizer";
import { dataForSeoPost, getProviderItems, isDataForSeoConfigured } from "@/lib/integrations/dataforseo";
import { researchSource } from "@/lib/integrations/research-policy";
import type { Db } from "mongodb";
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
    const [googleResult, topResults] = await Promise.all([
      googleRanking(gscLookup, keyword, finalUrl, host),
      googleTopResults(db, session.user.id, site, keyword, language, page, html),
    ]);
    // Gaps against the pages Google actually ranks join the plan, ordered by impact.
    if (topResults.status === "ok" && topResults.benchmark.gaps.length) {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      analysis.plan = [...analysis.plan, ...topResults.benchmark.gaps.map((gap) => ({ step: gap.title, fix: gap.fix, impact: gap.impact }))]
        .sort((a, b) => rank[a.impact as keyof typeof rank] - rank[b.impact as keyof typeof rank]);
    }
    const now = new Date();
    await db.collection("keyword_targets").updateOne(
      { userId: session.user.id, url: finalUrl, keyword: keyword.toLowerCase() },
      { $set: { updatedAt: now, organizationId: site?.organizationId ?? null }, $setOnInsert: { createdAt: now }, $push: { history: { $each: [{ at: now, score: analysis.score, position: googleResult.position, serpPosition: topResults.status === "ok" ? topResults.position : undefined, googleStatus: googleResult.status, googleMessage: googleResult.message }], $slice: -60 } } } as never,
      { upsert: true },
    );
    return NextResponse.json({ url: finalUrl, keyword, checkedAt: now.toISOString(), market: { language, country }, google: googleResult, topResults, relatedSearches, questions, ...analysis }, { headers: noStore });
  } catch (error) {
    console.error("Keyword optimizer failed:", error);
    return fail("The analysis failed. Please try again.", 502);
  }
}

const SERP_CACHE = "serp_benchmark_cache";
const SERP_CACHE_HOURS = 24;
type CachedSerp = { key: string; top10: SerpResult[]; organic: SerpResult[]; competitors: Array<{ url: string; profile: PageProfile; text: string }>; createdAt: Date; expiresAt: Date };

/**
 * Live Google results for the keyword (DataForSEO), the site's position, and a benchmark of the page against the
 * top-ranking pages. Paid calls only for verified websites; cached 24h per keyword + market; 25 fresh checks/day.
 */
async function googleTopResults(db: Db, userId: string, site: Record<string, unknown> | null, keyword: string, language: string, page: Parameters<typeof pageProfile>[0], html: string) {
  if (!site) return { status: "not_your_site" as const, message: "Add and verify this website to compare it with Google's top results." };
  if (researchSource("rank", { paidConfigured: isDataForSeoConfigured(), verified: Boolean(site.verifiedAt) }) !== "paid") {
    return { status: "unavailable" as const, message: site.verifiedAt ? "Live Google results are not configured on this server." : "Verify ownership of this website to compare it with Google's top results." };
  }
  const domain = String(site.domain);
  const locationCode = Number.isSafeInteger(Number(site.rankTrackingLocationCode)) && Number(site.rankTrackingLocationCode) > 0 ? Number(site.rankTrackingLocationCode) : 2356;
  const key = `${keyword.toLowerCase()}|${locationCode}|${language}`;
  try {
    const collection = db.collection<CachedSerp>(SERP_CACHE);
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
    await collection.createIndex({ key: 1 }, { unique: true }).catch(() => undefined);
    let cached: CachedSerp | null = await collection.findOne({ key, expiresAt: { $gt: new Date() } }, { projection: { _id: 0 } });
    if (!cached) {
      const limit = await consumeRateLimit(db, "serp-benchmark", userId, 25, 24 * 60 * 60_000);
      if (!limit.allowed) return { status: "limit" as const, message: `You have used today's 25 live Google comparisons. Try again in ${Math.ceil(limit.retryAfterSeconds / 3600)} hours.` };
      const result = await dataForSeoPost("serp/google/organic/live/advanced", [{ keyword, location_code: locationCode, language_code: language, device: "desktop", depth: 50 }]);
      const serp = parseSerp(getProviderItems(result), domain);
      const competitors = (await Promise.all(serp.organic.slice(0, 6).map(async (item) => {
        try {
          const fetched = await safeGet(item.url);
          if (!fetched.response.ok || !/text\/html/i.test(fetched.response.headers.get("content-type") || "")) return null;
          const audited = auditHtml(item.url, fetched.finalUrl, fetched.response.status, fetched.body, fetched.response.headers, { primaryKeywords: [keyword] });
          return { url: item.url, domain: item.domain, profile: pageProfile(audited, fetched.body, keyword), text: visiblePageText(fetched.body).slice(0, 60_000) };
        } catch { return null; }
      }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const now = new Date();
      cached = { key, top10: serp.top10, organic: serp.organic, competitors: competitors.map(({ url, profile, text }) => ({ url, profile, text })), createdAt: now, expiresAt: new Date(now.getTime() + SERP_CACHE_HOURS * 3_600_000) };
      await collection.updateOne({ key }, { $set: cached }, { upsert: true });
    }
    const own = parseSerp(cached.organic.map((item) => ({ type: "organic", url: item.url, domain: item.domain, title: item.title, rank_group: item.rank })), domain);
    const ownHost = domain.toLowerCase().replace(/^www\./, "");
    const rivals = cached.competitors.filter((item) => { try { const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, ""); return host !== ownHost && !host.endsWith(`.${ownHost}`); } catch { return false; } }).slice(0, 3);
    const benchmark = benchmarkPage(pageProfile(page, html, keyword), rivals.map((item) => item.profile), serpMissingTopics(html, rivals.map((item) => item.text), keyword), keyword);
    return {
      status: "ok" as const,
      position: own.yours?.rank ?? null,
      rankingUrl: own.yours?.url ?? null,
      depth: 50,
      top10: cached.top10.map((item) => ({ ...item, yours: item.domain === ownHost || item.domain.endsWith(`.${ownHost}`) })),
      comparedWith: rivals.map((item) => item.url),
      benchmark,
      checkedAt: cached.createdAt.toISOString(),
    };
  } catch (error) {
    console.error("Google top results failed:", error);
    return { status: "error" as const, message: error instanceof Error ? error.message : "Live Google results are unavailable right now." };
  }
}
