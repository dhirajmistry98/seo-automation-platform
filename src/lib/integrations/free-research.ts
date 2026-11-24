import type { Db } from "mongodb";
import { getGoogleAccessToken, googleApiError } from "@/lib/integrations/google";
import { findCannibalization, type GscRow } from "@/lib/integrations/research-utils";

/**
 * Free research sources — always available, no paid provider required:
 * - Google's public autocomplete endpoint for keyword and question ideas.
 * - The website's own Google Search Console data (when connected) for real
 *   impressions, clicks and average positions.
 * These do not provide search volume, backlinks, competitor or AI-mention data.
 */

export const FREE_RESEARCH_KINDS = ["keywords", "questions", "rank"] as const;
export const FREE_PROVIDER = "Google Autocomplete + Search Console";

export const QUESTION_PREFIXES = ["what", "how", "why", "which", "where", "when", "who", "can", "is", "does", "should", "are"];
const QUESTION_PATTERN = /^(who|what|where|when|why|how|which|can|does|do|is|are|should|will|could|would)\b/i;

export async function googleSuggest(query: string, language: string, country: string): Promise<string[]> {
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.search = new URLSearchParams({ client: "firefox", hl: language, gl: country.toLowerCase(), q: query }).toString();
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOStudio/1.0)" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return [];
    const payload = JSON.parse(await response.text()) as unknown;
    return Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1].filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number; page: string | null };

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

export type SearchConsoleLookup =
  | { status: "ok"; context: { accessToken: string; property: string } }
  | { status: "not_connected" | "no_property" | "api_error"; message: string };

/** Resolve the Search Console property for this domain, explaining why when it cannot be used. */
export async function searchConsoleLookup(db: Db, organizationId: unknown, domain: string): Promise<SearchConsoleLookup> {
  let accessToken: string;
  try { accessToken = await getGoogleAccessToken(db, organizationId, domain, "search_console"); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Search Console is not connected.";
    return { status: /not connected/i.test(message) ? "not_connected" : "api_error", message };
  }
  let response: Response;
  try { response = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) }); }
  catch { return { status: "api_error", message: "Search Console did not respond. Try again shortly." }; }
  if (!response.ok) return { status: "api_error", message: await googleApiError(response, "Search Console could not list your properties.") };
  const payload = await response.json().catch(() => ({})) as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> };
  const host = (siteUrl: string) => siteUrl.startsWith("sc-domain:") ? siteUrl.slice(10) : (() => { try { return new URL(siteUrl).hostname; } catch { return ""; } })();
  const matches = (payload.siteEntry || []).filter((item) => item.permissionLevel !== "siteUnverifiedUser" && bareHost(host(item.siteUrl)) === bareHost(domain));
  // Prefer a domain property because it covers every protocol and subdomain.
  const property = matches.find((item) => item.siteUrl.startsWith("sc-domain:")) ?? matches[0];
  if (!property) return { status: "no_property", message: `The connected Google account has no verified Search Console property for ${domain}. Add and verify ${domain} in Search Console, then re-check.` };
  return { status: "ok", context: { accessToken, property: property.siteUrl } };
}

/** Resolve the Search Console property for this domain, or null when Search Console is not connected or has no matching property. */
export async function searchConsoleContext(db: Db, organizationId: unknown, domain: string) {
  const lookup = await searchConsoleLookup(db, organizationId, domain);
  return lookup.status === "ok" ? lookup.context : null;
}

function reportDates() {
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 27 * 86_400_000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** Last-28-day metrics for one query, or the Google error that prevented reading them. */
export async function fetchKeywordMetrics(context: { accessToken: string; property: string }, keyword: string): Promise<{ metrics: GscMetrics } | { error: string }> {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(context.property)}/searchAnalytics/query`;
  const body = { ...reportDates(), dimensions: ["query", "page"], dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: keyword.toLowerCase() }] }], rowLimit: 10 };
  let response: Response;
  try { response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${context.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
  catch { return { error: "Search Console did not respond. Try again shortly." }; }
  if (!response.ok) return { error: await googleApiError(response, "Search Console data could not be read.") };
  const payload = await response.json().catch(() => ({})) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }> };
  const rows = payload.rows || [];
  if (!rows.length) return { metrics: { clicks: 0, impressions: 0, ctr: 0, position: 0, page: null } };
  const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  // Impression-weighted average position across ranking pages; the best page is the one with the most impressions.
  const position = impressions ? rows.reduce((sum, row) => sum + (row.position || 0) * (row.impressions || 0), 0) / impressions : 0;
  const best = [...rows].sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0];
  return { metrics: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: Math.round(position * 10) / 10, page: best?.keys?.[1] ?? null } };
}

export async function queryMetrics(context: { accessToken: string; property: string }, keyword: string): Promise<GscMetrics | null> {
  const result = await fetchKeywordMetrics(context, keyword);
  return "metrics" in result ? result.metrics : null;
}

export async function freeKeywordIdeas(db: Db, organizationId: unknown, domain: string, keywords: string[], language: string, country: string) {
  const context = await searchConsoleContext(db, organizationId, domain);
  const items = await Promise.all(keywords.map(async (keyword) => {
    const [suggestions, gsc] = await Promise.all([googleSuggest(keyword, language, country), context ? queryMetrics(context, keyword) : Promise.resolve(null)]);
    return { keyword, suggestions: suggestions.filter((item) => item.toLowerCase() !== keyword.toLowerCase()).slice(0, 8), gsc };
  }));
  return { items, searchConsoleConnected: Boolean(context) };
}

export async function freeQuestionIdeas(seed: string, language: string, country: string) {
  const batches = await Promise.all([seed, ...QUESTION_PREFIXES.map((prefix) => `${prefix} ${seed}`)].map((query) => googleSuggest(query, language, country)));
  const seen = new Set<string>();
  const items: Array<Record<string, unknown>> = [];
  for (const suggestion of batches.flat()) {
    const text = suggestion.trim();
    const key = text.toLowerCase();
    if (!QUESTION_PATTERN.test(text) || seen.has(key)) continue;
    seen.add(key);
    items.push({ keyword: text, questionType: text.split(/\s+/)[0].toLowerCase() });
  }
  return items.slice(0, 100);
}

/** One row per keyword, in request order, so the rank table lines up with the query list. */
export async function freeRankPositions(db: Db, organizationId: unknown, domain: string, keywords: string[]) {
  const context = await searchConsoleContext(db, organizationId, domain);
  if (!context) return null;
  return Promise.all(keywords.map(async (keyword) => {
    const metrics = await queryMetrics(context, keyword);
    const ranked = Boolean(metrics && metrics.impressions > 0);
    let pageDomain = "";
    try { pageDomain = metrics?.page ? new URL(metrics.page).hostname : ""; } catch {}
    return {
      keyword,
      rank_group: ranked ? metrics!.position : "No impressions in the last 28 days",
      url: metrics?.page ?? undefined,
      domain: pageDomain || undefined,
      title: ranked ? `${metrics!.impressions} impressions · ${metrics!.clicks} clicks (Search Console, 28 days)` : "Not seen in Search Console for this site",
    };
  }));
}

/**
 * Quick-wins report: GSC keywords at positions 4–20 with meaningful impressions.
 * These are "almost top-3" keywords — a targeted content or on-page update can push
 * them onto page 1. Returns null when Search Console is not connected.
 */
export async function freeQuickWins(
  db: Db,
  organizationId: unknown,
  domain: string,
): Promise<{ items: Array<Record<string, unknown>>; total: number } | { error: string } | null> {
  const context = await searchConsoleContext(db, organizationId, domain);
  if (!context) return null;
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 87 * 86_400_000); // 90-day window
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(context.property)}/searchAnalytics/query`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${context.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query", "page"],
        rowLimit: 25_000,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch { return { error: "Search Console did not respond. Try again shortly." }; }
  if (!response.ok) return { error: await googleApiError(response, "Search Console data could not be read.") };
  const payload = await response.json().catch(() => ({})) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };
  const rows = payload.rows || [];

  // Aggregate per query (a keyword may rank via multiple pages — keep the best-ranking page)
  const byQuery = new Map<string, { keyword: string; page: string; impressions: number; clicks: number; position: number; ctr: number }>();
  for (const row of rows) {
    const keyword = row.keys?.[0];
    const page = row.keys?.[1];
    if (!keyword || !page) continue;
    const pos = row.position ?? 0;
    const imp = row.impressions ?? 0;
    if (pos < 1 || pos > 20 || imp < 10) continue; // skip top-3 and very weak signals
    const existing = byQuery.get(keyword);
    if (!existing || pos < existing.position) {
      byQuery.set(keyword, { keyword, page, impressions: imp, clicks: row.clicks ?? 0, position: Math.round(pos * 10) / 10, ctr: Math.round((row.ctr ?? 0) * 10_000) / 100 });
    }
  }

  // Keep positions 4–20 and sort by opportunity: impressions weighted by closeness to top 3
  const candidates = [...byQuery.values()].filter((r) => r.position >= 4 && r.position <= 20);
  const maxImp = Math.max(...candidates.map((r) => r.impressions), 1);
  candidates.sort((a, b) => {
    const scoreA = (a.impressions / maxImp) * Math.max(0, (21 - a.position) / 17);
    const scoreB = (b.impressions / maxImp) * Math.max(0, (21 - b.position) / 17);
    return scoreB - scoreA;
  });

  const items = candidates.slice(0, 100).map((r) => ({
    keyword: r.keyword,
    position: r.position,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    page: r.page,
    // Potential extra clicks if keyword reaches position 1 (avg CTR ~28%)
    potential_clicks: Math.round(r.impressions * 0.28),
  }));
  return { items, total: candidates.length };
}

/** Cannibalization report (last 28 days of Search Console data), or null when Search Console is not connected. */
export async function freeCannibalization(db: Db, organizationId: unknown, domain: string): Promise<{ items: ReturnType<typeof findCannibalization> } | { error: string } | null> {
  const context = await searchConsoleContext(db, organizationId, domain);
  if (!context) return null;
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(context.property)}/searchAnalytics/query`;
  let response: Response;
  try { response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${context.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...reportDates(), dimensions: ["query", "page"], rowLimit: 25_000 }), cache: "no-store", signal: AbortSignal.timeout(30_000) }); }
  catch { return { error: "Search Console did not respond. Try again shortly." }; }
  if (!response.ok) return { error: await googleApiError(response, "Search Console data could not be read.") };
  const payload = await response.json().catch(() => ({})) as { rows?: GscRow[] };
  return { items: findCannibalization(payload.rows || []) };
}
