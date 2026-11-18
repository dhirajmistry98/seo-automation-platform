/**
 * Semrush-style research reports built on DataForSEO: domain overview, organic research, top pages, paid
 * keywords, keyword magic, backlink analytics (referring domains, anchors, new/lost links), backlink gap,
 * share of voice and a local map-pack grid.
 *
 * Every report returns flat rows (only the fields the UI shows) so saved reports stay small, plus an optional
 * summary object. Network calls go through the injected `post` so the parsers can be tested without a provider.
 */
import type { GeoPoint } from "@/lib/seo/geo-target";

export const EXTENDED_RESEARCH_KINDS = [
  "domain_overview", "organic_keywords", "top_pages", "paid_keywords", "keyword_magic",
  "referring_domains", "anchors", "backlink_list", "backlink_gap", "share_of_voice", "local_grid",
] as const;
export type ExtendedResearchKind = (typeof EXTENDED_RESEARCH_KINDS)[number];

export function isExtendedResearchKind(value: unknown): value is ExtendedResearchKind {
  return typeof value === "string" && (EXTENDED_RESEARCH_KINDS as readonly string[]).includes(value);
}

/** Reports that may look at a saved competitor instead of the website itself. */
export const DOMAIN_TARGET_KINDS: readonly ExtendedResearchKind[] = ["domain_overview", "organic_keywords", "top_pages", "paid_keywords", "referring_domains", "anchors", "backlink_list"];

export type BacklinkMode = "all" | "new" | "lost";
export type GridSize = 3 | 5;

export type ProviderResult = { cost?: number; tasks?: Array<{ result?: Array<Record<string, unknown>> | null }> };
export type ProviderPost = (path: string, payload: Array<Record<string, unknown>>) => Promise<ProviderResult>;

export type ExtendedResearchInput = {
  kind: ExtendedResearchKind;
  domain: string;
  /** Domain the report is about: the website, or a saved competitor for domain reports. */
  target: string;
  competitorDomains: string[];
  keywords: string[];
  countryLocationCode: number;
  languageCode: string;
  geoPoint: GeoPoint | null;
  backlinkMode: BacklinkMode;
  gridSize: GridSize;
  gridSpacingKm: number;
  now?: Date;
};

export type ExtendedResearchOutput = { query: string; items: Array<Record<string, unknown>>; summary?: Record<string, unknown>; cost: number };

type Row = Record<string, unknown>;

function obj(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function str(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function path(value: unknown, ...keys: string[]): unknown { let current = value; for (const key of keys) current = obj(current)[key]; return current; }

/** The `result` entries of every task (some endpoints put the data there instead of in `items`). */
export function providerResults(result: ProviderResult): Row[] {
  return (result.tasks || []).flatMap((task) => (task.result || []).filter((entry): entry is Row => Boolean(entry) && typeof entry === "object"));
}

export function providerResultItems(result: ProviderResult): Row[] {
  return providerResults(result).flatMap((entry) => Array.isArray(entry.items) ? entry.items.filter((item): item is Row => Boolean(item) && typeof item === "object") : []);
}

export function bareDomain(value: string) { return value.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }

/** True when a host (or URL) belongs to `domain` or one of its subdomains. */
export function belongsTo(hostOrUrl: unknown, domain: string) {
  if (typeof hostOrUrl !== "string" || !hostOrUrl) return false;
  let host = hostOrUrl;
  if (hostOrUrl.includes("/")) { try { host = new URL(hostOrUrl).hostname; } catch { return false; } }
  const candidate = bareDomain(host);
  const own = bareDomain(domain);
  return candidate === own || candidate.endsWith(`.${own}`);
}

function keywordRow(data: unknown) {
  const info = obj(path(data, "keyword_info"));
  const monthly = Array.isArray(info.monthly_searches) ? info.monthly_searches as Row[] : [];
  return {
    keyword: str(path(data, "keyword")),
    search_volume: num(info.search_volume),
    cpc: num(info.cpc),
    competition: num(info.competition),
    keyword_difficulty: num(path(data, "keyword_properties", "keyword_difficulty")),
    intent: str(path(data, "search_intent_info", "main_intent")),
    // Oldest first, so the UI can draw a left-to-right trend.
    trend: monthly.map((month) => num(month.search_volume) ?? 0).slice(0, 12).reverse(),
  };
}

export function parseRankedKeywords(result: ProviderResult) {
  return providerResultItems(result).map((item) => {
    const serp = obj(path(item, "ranked_serp_element", "serp_item"));
    const changes = obj(serp.rank_changes);
    return {
      ...keywordRow(item.keyword_data),
      position: num(serp.rank_group),
      absolute_position: num(serp.rank_absolute),
      previous_position: num(changes.previous_rank_absolute),
      is_new: changes.is_new === true,
      is_up: changes.is_up === true,
      is_down: changes.is_down === true,
      url: str(serp.url),
      title: str(serp.title),
      description: str(serp.description),
      etv: num(serp.etv),
      serp_type: str(serp.type),
    };
  }).filter((row) => row.keyword);
}

function domainMetrics(metrics: unknown) {
  const organic = obj(path(metrics, "organic"));
  const paid = obj(path(metrics, "paid"));
  const pick = (source: Row) => ({
    etv: num(source.etv), count: num(source.count), traffic_cost: num(source.estimated_paid_traffic_cost),
    pos_1: num(source.pos_1), pos_2_3: num(source.pos_2_3), pos_4_10: num(source.pos_4_10), pos_11_20: num(source.pos_11_20),
    pos_21_50: ["pos_21_30", "pos_31_40", "pos_41_50"].reduce((sum, key) => sum + (num(source[key]) ?? 0), 0),
    pos_51_100: ["pos_51_60", "pos_61_70", "pos_71_80", "pos_81_90", "pos_91_100"].reduce((sum, key) => sum + (num(source[key]) ?? 0), 0),
    is_new: num(source.is_new), is_up: num(source.is_up), is_down: num(source.is_down), is_lost: num(source.is_lost),
  });
  return { organic: pick(organic), paid: pick(paid) };
}

export function parseHistory(result: ProviderResult) {
  return providerResultItems(result).map((item) => ({
    year: num(item.year), month: num(item.month),
    organic_etv: num(path(item, "metrics", "organic", "etv")), organic_count: num(path(item, "metrics", "organic", "count")),
    paid_etv: num(path(item, "metrics", "paid", "etv")), paid_count: num(path(item, "metrics", "paid", "count")),
  })).filter((row) => row.year && row.month).sort((a, b) => (a.year! - b.year!) || (a.month! - b.month!));
}

export function parseBacklinkSummary(result: ProviderResult) {
  const entry = providerResults(result)[0] || {};
  return {
    rank: num(entry.rank), backlinks: num(entry.backlinks), referring_domains: num(entry.referring_domains),
    referring_main_domains: num(entry.referring_main_domains), referring_ips: num(entry.referring_ips),
    broken_backlinks: num(entry.broken_backlinks), spam_score: num(entry.backlinks_spam_score),
    nofollow_domains: num(entry.referring_domains_nofollow), first_seen: str(entry.first_seen),
  };
}

export function parseTopPages(result: ProviderResult) {
  return providerResultItems(result).map((item) => ({
    url: str(item.page_address),
    etv: num(path(item, "metrics", "organic", "etv")),
    keywords: num(path(item, "metrics", "organic", "count")),
    pos_1: num(path(item, "metrics", "organic", "pos_1")),
    pos_2_3: num(path(item, "metrics", "organic", "pos_2_3")),
    pos_4_10: num(path(item, "metrics", "organic", "pos_4_10")),
    paid_etv: num(path(item, "metrics", "paid", "etv")),
  })).filter((row) => row.url);
}

export function parseKeywordIdeas(result: ProviderResult) {
  return providerResultItems(result).map((item) => keywordRow(item)).filter((row) => row.keyword);
}

export function parseReferringDomains(result: ProviderResult) {
  return providerResultItems(result).map((item) => ({
    domain: str(item.domain), rank: num(item.rank), backlinks: num(item.backlinks),
    referring_pages: num(item.referring_pages), spam_score: num(item.backlinks_spam_score),
    first_seen: str(item.first_seen), lost_date: str(item.lost_date),
  })).filter((row) => row.domain);
}

export function parseAnchors(result: ProviderResult) {
  return providerResultItems(result).map((item) => ({
    anchor: typeof item.anchor === "string" ? item.anchor : null,
    backlinks: num(item.backlinks), referring_domains: num(item.referring_domains), rank: num(item.rank),
    first_seen: str(item.first_seen), spam_score: num(item.backlinks_spam_score),
  })).filter((row) => row.anchor !== null);
}

export function parseBacklinks(result: ProviderResult) {
  return providerResultItems(result).map((item) => ({
    url_from: str(item.url_from), domain_from: str(item.domain_from), url_to: str(item.url_to),
    anchor: typeof item.anchor === "string" ? item.anchor : null, dofollow: item.dofollow === true,
    rank: num(item.rank), page_rank: num(item.page_from_rank), spam_score: num(item.backlink_spam_score),
    first_seen: str(item.first_seen), last_seen: str(item.last_seen), is_new: item.is_new === true, is_lost: item.is_lost === true,
    item_type: str(item.item_type),
  })).filter((row) => row.url_from);
}

/** Domains linking to at least one competitor but not to the website, with which competitors they link to. */
export function parseBacklinkGap(result: ProviderResult, competitors: string[]) {
  return providerResultItems(result).map((item) => {
    const intersection = obj(item.domain_intersection);
    const entries = Object.entries(intersection).map(([key, value]) => ({ index: Number(key) - 1, value: obj(value) }));
    const first = entries.find((entry) => str(entry.value.target));
    const links: Record<string, number | null> = {};
    for (const competitor of competitors) links[competitor] = null;
    for (const entry of entries) { const competitor = competitors[entry.index]; if (competitor) links[competitor] = num(entry.value.backlinks); }
    return {
      domain: first ? str(first.value.target) : null,
      rank: Math.max(0, ...entries.map((entry) => num(entry.value.rank) ?? 0)),
      links,
      competitor_count: Object.values(links).filter((value) => value !== null && value > 0).length,
    };
  }).filter((row) => row.domain).sort((a, b) => (b.competitor_count - a.competitor_count) || (b.rank - a.rank));
}

export function parseShareOfVoice(result: ProviderResult, domain: string, competitors: string[]) {
  const rows = providerResultItems(result).map((item) => ({
    domain: str(item.domain), avg_position: num(item.avg_position), median_position: num(item.median_position),
    etv: num(item.etv), keywords_count: num(item.keywords_count), visibility: num(item.visibility), rating: num(item.rating),
  })).filter((row) => row.domain);
  const totalEtv = rows.reduce((sum, row) => sum + (row.etv ?? 0), 0);
  return rows.map((row) => ({
    ...row,
    // Share of the estimated clicks across the tracked keywords that this domain wins.
    share: totalEtv > 0 ? Math.round(((row.etv ?? 0) / totalEtv) * 1000) / 10 : null,
    is_own: belongsTo(row.domain, domain),
    is_competitor: competitors.some((competitor) => belongsTo(row.domain, competitor)),
  }));
}

/** Grid of points centred on `center`, `spacingKm` apart (row 0 is north). */
export function gridPoints(center: { latitude: number; longitude: number }, size: GridSize, spacingKm: number) {
  const half = (size - 1) / 2;
  const latStep = spacingKm / 111.32;
  const lngStep = spacingKm / (111.32 * Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180)));
  const points: Array<{ row: number; col: number; latitude: number; longitude: number }> = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const latitude = Math.max(-90, Math.min(90, center.latitude + (half - row) * latStep));
      const longitude = ((center.longitude + (col - half) * lngStep + 540) % 360) - 180;
      points.push({ row, col, latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) });
    }
  }
  return points;
}

/** Map-pack position of the website among Google Maps results at one grid point. */
export function parseMapsPoint(result: ProviderResult, domain: string) {
  const items = providerResultItems(result).filter((item) => item.type === "maps_search");
  const match = items.find((item) => belongsTo(item.domain, domain) || belongsTo(item.url, domain));
  return {
    rank: match ? num(match.rank_group) : null,
    title: match ? str(match.title) : null,
    top: items.slice(0, 3).map((item) => ({ title: str(item.title), domain: str(item.domain), rating: num(path(item, "rating", "value")) })),
    results: items.length,
  };
}

/** Google Maps zoom from the grid spacing: wider grids need a wider map view. */
function mapsZoom(spacingKm: number) { return spacingKm >= 5 ? 12 : spacingKm >= 2 ? 13 : spacingKm >= 1 ? 14 : 15; }

/** Backlink filter timestamp, in the provider's "YYYY-MM-DD hh:mm:ss +00:00" format. */
function daysAgo(now: Date, days: number) { return `${new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)} 00:00:00 +00:00`; }

function cost(...results: ProviderResult[]) { return results.reduce((sum, result) => sum + (Number.isFinite(result.cost) ? Number(result.cost) : 0), 0); }

export async function runExtendedResearch(input: ExtendedResearchInput, post: ProviderPost): Promise<ExtendedResearchOutput> {
  const { kind, target, domain, countryLocationCode: location_code, languageCode: language_code } = input;
  const now = input.now ?? new Date();
  const labs = { location_code, language_code };
  if (kind === "domain_overview") {
    const yearAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const [overview, history, backlinks, keywords] = await Promise.all([
      post("dataforseo_labs/google/domain_rank_overview/live", [{ target, ...labs }]),
      post("dataforseo_labs/google/historical_rank_overview/live", [{ target, ...labs, date_from: yearAgo }]),
      post("backlinks/summary/live", [{ target, include_subdomains: true, backlinks_status_type: "live" }]),
      post("dataforseo_labs/google/ranked_keywords/live", [{ target, ...labs, item_types: ["organic"], limit: 20, order_by: ["ranked_serp_element.serp_item.etv,desc"] }]),
    ]);
    const metrics = domainMetrics(providerResultItems(overview)[0]?.metrics);
    return { query: target, items: parseRankedKeywords(keywords), summary: { target, ...metrics, history: parseHistory(history), backlinks: parseBacklinkSummary(backlinks) }, cost: cost(overview, history, backlinks, keywords) };
  }
  if (kind === "organic_keywords" || kind === "paid_keywords") {
    const paid = kind === "paid_keywords";
    const result = await post("dataforseo_labs/google/ranked_keywords/live", [{
      target, ...labs, item_types: [paid ? "paid" : "organic"], limit: paid ? 200 : 500,
      order_by: [paid ? "keyword_data.keyword_info.search_volume,desc" : "ranked_serp_element.serp_item.etv,desc"],
    }]);
    const entry = providerResults(result)[0] || {};
    return { query: target, items: parseRankedKeywords(result), summary: { target, total_count: num(entry.total_count), ...domainMetrics(entry.metrics) }, cost: cost(result) };
  }
  if (kind === "top_pages") {
    const result = await post("dataforseo_labs/google/relevant_pages/live", [{ target, ...labs, limit: 200, order_by: ["metrics.organic.etv,desc"] }]);
    return { query: target, items: parseTopPages(result), summary: { target, total_count: num(providerResults(result)[0]?.total_count) }, cost: cost(result) };
  }
  if (kind === "keyword_magic") {
    const seed = input.keywords[0];
    const result = await post("dataforseo_labs/google/keyword_suggestions/live", [{ keyword: seed, ...labs, include_seed_keyword: true, include_serp_info: false, limit: 500, order_by: ["keyword_info.search_volume,desc"] }]);
    const seedData = obj(providerResults(result)[0]?.seed_keyword_data);
    const items = parseKeywordIdeas(result);
    if (seedData.keyword_info && !items.some((item) => item.keyword === seed)) items.unshift(keywordRow({ keyword: seed, ...seedData }));
    return { query: seed, items, summary: { total_count: num(providerResults(result)[0]?.total_count) }, cost: cost(result) };
  }
  if (kind === "referring_domains") {
    const result = await post("backlinks/referring_domains/live", [{ target, include_subdomains: true, backlinks_status_type: "live", limit: 300, order_by: ["rank,desc"] }]);
    return { query: target, items: parseReferringDomains(result), summary: { target, total_count: num(providerResults(result)[0]?.total_count) }, cost: cost(result) };
  }
  if (kind === "anchors") {
    const result = await post("backlinks/anchors/live", [{ target, include_subdomains: true, backlinks_status_type: "live", limit: 300, order_by: ["backlinks,desc"] }]);
    return { query: target, items: parseAnchors(result), summary: { target, total_count: num(providerResults(result)[0]?.total_count) }, cost: cost(result) };
  }
  if (kind === "backlink_list") {
    const mode = input.backlinkMode;
    const task: Row = { target, include_subdomains: true, limit: 300 };
    if (mode === "new") Object.assign(task, { mode: "as_is", backlinks_status_type: "live", filters: ["first_seen", ">=", daysAgo(now, 30)], order_by: ["first_seen,desc"] });
    else if (mode === "lost") Object.assign(task, { mode: "as_is", backlinks_status_type: "lost", order_by: ["last_seen,desc"] });
    else Object.assign(task, { mode: "one_per_domain", backlinks_status_type: "live", order_by: ["rank,desc"] });
    const result = await post("backlinks/backlinks/live", [task]);
    return { query: target, items: parseBacklinks(result), summary: { target, mode, total_count: num(providerResults(result)[0]?.total_count) }, cost: cost(result) };
  }
  if (kind === "backlink_gap") {
    const competitors = input.competitorDomains.slice(0, 5);
    const targets = Object.fromEntries(competitors.map((competitor, index) => [String(index + 1), competitor]));
    const result = await post("backlinks/domain_intersection/live", [{ targets, exclude_targets: [domain], intersection_mode: "partial", include_subdomains: true, limit: 300 }]);
    return { query: competitors.join(", "), items: parseBacklinkGap(result, competitors), summary: { competitors }, cost: cost(result) };
  }
  if (kind === "share_of_voice") {
    const result = await post("dataforseo_labs/google/serp_competitors/live", [{ keywords: input.keywords, ...labs, item_types: ["organic"], include_subdomains: true, limit: 50, order_by: ["etv,desc"] }]);
    return { query: input.keywords.join(", ").slice(0, 2_000), items: parseShareOfVoice(result, domain, input.competitorDomains), summary: { keywords: input.keywords.length }, cost: cost(result) };
  }
  // local_grid: one Google Maps check per grid point (DataForSEO live Maps takes one task per call).
  const center = input.geoPoint;
  if (!center) throw new Error("Choose an exact map location for the local grid.");
  const keyword = input.keywords[0];
  const zoom = mapsZoom(input.gridSpacingKm);
  const points = gridPoints(center, input.gridSize, input.gridSpacingKm);
  const results = await Promise.all(points.map((point) => post("serp/google/maps/live/advanced", [{ keyword, location_coordinate: `${point.latitude},${point.longitude},${zoom}z`, language_code, depth: 20 }])));
  const items = points.map((point, index) => ({ ...point, ...parseMapsPoint(results[index], domain) }));
  const found = items.filter((item) => item.rank !== null);
  return {
    query: keyword,
    items,
    summary: {
      grid_size: input.gridSize, spacing_km: input.gridSpacingKm, center: { latitude: center.latitude, longitude: center.longitude },
      found: found.length, points: items.length,
      average_rank: found.length ? Math.round((found.reduce((sum, item) => sum + (item.rank ?? 0), 0) / found.length) * 10) / 10 : null,
      top3: found.filter((item) => (item.rank ?? 99) <= 3).length,
    },
    cost: cost(...results),
  };
}

export type GscRow = { keys?: string[]; clicks?: number; impressions?: number; position?: number };

/**
 * Keyword cannibalization from the site's own Search Console data: queries where two or more of its pages
 * each earn a meaningful share (at least 10%) of the impressions, so the pages compete with each other.
 */
export function findCannibalization(rows: GscRow[], minImpressions = 10) {
  const byQuery = new Map<string, Array<{ page: string; clicks: number; impressions: number; position: number }>>();
  for (const row of rows) {
    const [query, page] = row.keys || [];
    if (!query || !page) continue;
    const list = byQuery.get(query) || [];
    list.push({ page, clicks: row.clicks || 0, impressions: row.impressions || 0, position: Math.round((row.position || 0) * 10) / 10 });
    byQuery.set(query, list);
  }
  const results: Array<{ keyword: string; impressions: number; clicks: number; pages: Array<{ page: string; clicks: number; impressions: number; position: number; share: number }> }> = [];
  for (const [keyword, pages] of byQuery) {
    const impressions = pages.reduce((sum, page) => sum + page.impressions, 0);
    if (impressions < minImpressions) continue;
    const competing = pages
      .map((page) => ({ ...page, share: Math.round((page.impressions / impressions) * 1000) / 10 }))
      .filter((page) => page.share >= 10)
      .sort((a, b) => b.impressions - a.impressions);
    if (competing.length >= 2) results.push({ keyword, impressions, clicks: pages.reduce((sum, page) => sum + page.clicks, 0), pages: competing.slice(0, 5) });
  }
  return results.sort((a, b) => b.impressions - a.impressions).slice(0, 200);
}

/** Flat CSV of the rows the report shows (nested values are JSON). */
export function reportCsv(rows: Array<Record<string, unknown>>) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Neutralise spreadsheet formulas in exported text.
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
}
