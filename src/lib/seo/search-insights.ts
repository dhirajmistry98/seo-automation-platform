/**
 * Search Console insights. Pure functions over rows Google returned for the user's own site.
 * Positions are impression-weighted averages for the chosen period, not live rank checks.
 */
import { brandTermsFor, expectedCtr, normalizeQuery } from "@/lib/seo/keyword-strategy";
import { searchVisibilityScore } from "@/lib/seo/site-overview";

export type GscRow = { keys?: string[]; clicks?: number; impressions?: number; position?: number };
export type Metric = { key: string; clicks: number; impressions: number; position: number };

export const toMetrics = (rows: GscRow[]): Metric[] => rows.flatMap((row) => row.keys?.[0] ? [{ key: row.keys[0], clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, position: Number(row.position) || 0 }] : []);
const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (rows: Metric[], field: "clicks" | "impressions") => rows.reduce((total, row) => total + row[field], 0);
const asQueries = (rows: Metric[]) => rows.map((row) => ({ query: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position }));

export function totals(rows: Metric[]) {
  const clicks = sum(rows, "clicks"), impressions = sum(rows, "impressions");
  const position = impressions ? round1(rows.reduce((total, row) => total + row.position * row.impressions, 0) / impressions) : null;
  return { clicks, impressions, position, keywords: rows.length, visibility: searchVisibilityScore(asQueries(rows)) };
}

export const BUCKETS = ["1–3", "4–10", "11–20", "21–50", "51+"] as const;
export function distribution(rows: Metric[]) {
  const counts = [0, 0, 0, 0, 0];
  for (const { position } of rows) counts[position <= 3 ? 0 : position <= 10 ? 1 : position <= 20 ? 2 : position <= 50 ? 3 : 4] += 1;
  return BUCKETS.map((label, index) => ({ label, count: counts[index] }));
}

/** Position changes for queries seen in both periods with enough impressions to be meaningful. Positive change = moved up. */
export function movements(current: Metric[], previous: Metric[], minImpressions = 10) {
  const before = new Map(previous.map((row) => [row.key, row]));
  const now = new Set(current.map((row) => row.key));
  const changes = current.flatMap((row) => {
    const prior = before.get(row.key);
    if (!prior || row.impressions < minImpressions || prior.impressions < minImpressions) return [];
    const change = round1(prior.position - row.position);
    return change ? [{ query: row.key, from: round1(prior.position), to: round1(row.position), change, impressions: row.impressions, clicks: row.clicks }] : [];
  });
  return {
    winners: changes.filter((item) => item.change > 0).sort((a, b) => b.change - a.change || b.impressions - a.impressions).slice(0, 20),
    losers: changes.filter((item) => item.change < 0).sort((a, b) => a.change - b.change || b.impressions - a.impressions).slice(0, 20),
    newQueries: current.filter((row) => !before.has(row.key)).length,
    lostQueries: previous.filter((row) => !now.has(row.key)).length,
  };
}

export function trackedKeywords(keywords: string[], current: Metric[], previous: Metric[]) {
  const index = (rows: Metric[]) => new Map(rows.map((row) => [normalizeQuery(row.key), row]));
  const now = index(current), before = index(previous);
  return keywords.map((keyword) => {
    const row = now.get(normalizeQuery(keyword)), prior = before.get(normalizeQuery(keyword));
    return { keyword, position: row ? round1(row.position) : null, previous: prior ? round1(prior.position) : null, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 };
  });
}

/** Daily visibility, clicks and average position from rows keyed [date, query]. */
export function dailyTrend(rows: GscRow[]) {
  const days = new Map<string, Metric[]>();
  for (const row of rows) {
    const [date, query] = row.keys ?? [];
    if (!date || !query) continue;
    const list = days.get(date) ?? [];
    list.push({ key: query, clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, position: Number(row.position) || 0 });
    days.set(date, list);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, ...totals(list) }));
}

/** Pages that lost a quarter or more of their clicks compared with the previous period. */
export function contentDecay(current: Metric[], previous: Metric[], minClicks = 10, minDrop = 25) {
  const now = new Map(current.map((row) => [row.key, row]));
  return previous.flatMap((prior) => {
    if (prior.clicks < minClicks) return [];
    const row = now.get(prior.key);
    const clicks = row?.clicks ?? 0;
    const drop = Math.round(((prior.clicks - clicks) / prior.clicks) * 100);
    return drop >= minDrop ? [{ page: prior.key, before: prior.clicks, now: clicks, drop, positionBefore: round1(prior.position), positionNow: row ? round1(row.position) : null }] : [];
  }).sort((a, b) => (b.before - b.now) - (a.before - a.now)).slice(0, 50);
}

/** Page-one queries clicked far less than usual for their position. "Missed" clicks are an estimate from typical click-through rates. */
export function lowCtr(current: Metric[], minImpressions = 50) {
  return current.flatMap((row) => {
    if (row.position > 10 || row.impressions < minImpressions) return [];
    const ctr = row.clicks / row.impressions, typical = expectedCtr(row.position);
    return ctr < typical * 0.5 ? [{ query: row.key, position: round1(row.position), impressions: row.impressions, clicks: row.clicks, ctr: round1(ctr * 100), typical: round1(typical * 100), missed: Math.max(0, Math.round(row.impressions * typical - row.clicks)) }] : [];
  }).sort((a, b) => b.missed - a.missed).slice(0, 50);
}

export function brandSplit(current: Metric[], domain: string, name?: string) {
  const terms = brandTermsFor(domain, name).map((term) => normalizeQuery(term)).filter((term) => term.length > 2);
  const isBrand = (query: string) => { const text = normalizeQuery(query), joined = text.replace(/\s+/g, ""); return terms.some((term) => text.includes(term) || joined.includes(term.replace(/\s+/g, ""))); };
  const brand = current.filter((row) => isBrand(row.key)), other = current.filter((row) => !isBrand(row.key));
  return { terms, brand: totals(brand), nonBrand: totals(other) };
}

type Ga4Row = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
const pathOf = (value: string) => { try { const url = new URL(value, "https://placeholder.invalid"); return (url.pathname.replace(/\/+$/, "") || "/") + url.search; } catch { return value; } };

/** Joins Search Console pages with GA4 organic landing pages by path. GA4 metric order: users, sessions, engaged sessions, engagement rate, conversions. */
export function landingPages(pages: Metric[], ga4Rows: unknown[]) {
  const ga4 = new Map<string, { sessions: number; engagementRate: number; conversions: number }>();
  for (const row of ga4Rows as Ga4Row[]) {
    const path = row?.dimensionValues?.[0]?.value;
    if (!path || !path.startsWith("/")) continue;
    const values = (row.metricValues ?? []).map((item) => Number(item.value) || 0);
    ga4.set(pathOf(path), { sessions: values[1] ?? 0, engagementRate: Math.round((values[3] ?? 0) * 100), conversions: values[4] ?? 0 });
  }
  return [...pages].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50)
    .map((page) => ({ page: page.key, clicks: page.clicks, impressions: page.impressions, position: round1(page.position), analytics: ga4.get(pathOf(page.key)) ?? null }));
}
