/**
 * Public creator analytics from Meta: average Reel views and aggregated audience location and age
 * (follower_demographics is only available for accounts with 100+ followers). Pure helpers.
 */
export const AGE_BUCKETS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type Share = { key: string; percent: number };
export type ReelsStatus = "ok" | "no_reels" | "unavailable";
export type InstagramAnalytics = { avgReelViews: number | null; reelsSampled: number; reelsStatus?: ReelsStatus; countries: Share[]; ages: Share[]; fetchedAt: Date };

type Breakdown = { results?: Array<{ dimension_values?: unknown[]; value?: unknown }> };
/** Counts per dimension value from a follower_demographics response (last dimension is the breakdown). */
export function breakdownCounts(response: unknown) {
  const data = (response as { data?: Array<{ total_value?: { breakdowns?: Breakdown[] } }> } | null)?.data ?? [];
  const counts = new Map<string, number>();
  for (const entry of data) for (const breakdown of entry.total_value?.breakdowns ?? []) for (const row of breakdown.results ?? []) {
    const key = Array.isArray(row.dimension_values) ? String(row.dimension_values.at(-1) ?? "") : "";
    const value = typeof row.value === "number" && Number.isFinite(row.value) ? row.value : 0;
    if (key && value > 0) counts.set(key, (counts.get(key) || 0) + value);
  }
  return counts;
}

/** Top `limit` locations as whole percentages plus "Other" for the rest. */
export function topShares(counts: Map<string, number>, limit = 3): Share[] {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return [];
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([key, value]) => ({ key, percent: Math.round((value / total) * 100) }));
  const other = 100 - top.reduce((sum, item) => sum + item.percent, 0);
  return other > 0 && sorted.length > limit ? [...top, { key: "Other", percent: other }] : top;
}

/** Age groups in their natural order (missing groups shown as 0%). */
export function ageShares(counts: Map<string, number>): Share[] {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return [];
  return AGE_BUCKETS.map((key) => ({ key, percent: Math.round(((counts.get(key) || 0) / total) * 100) }));
}

/** Average of the Reel view counts we could read (null when none). */
export function averageViews(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}
