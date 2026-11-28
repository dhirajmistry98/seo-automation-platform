/** Chrome UX Report history: how real Chrome users experienced a site, week by week. */
export const CRUX_METRICS = [
  { id: "largest_contentful_paint", label: "Largest Contentful Paint", unit: "ms", good: 2500, poor: 4000 },
  { id: "interaction_to_next_paint", label: "Interaction to Next Paint", unit: "ms", good: 200, poor: 500 },
  { id: "cumulative_layout_shift", label: "Cumulative Layout Shift", unit: "", good: 0.1, poor: 0.25 },
] as const;

type CruxDate = { year: number; month: number; day: number };
export type CruxRecord = { record?: { metrics?: Record<string, { percentilesTimeseries?: { p75s?: Array<number | string | null> } }>; collectionPeriods?: Array<{ lastDate?: CruxDate }> } };

export function parseCruxHistory(data: CruxRecord) {
  const dates = (data.record?.collectionPeriods ?? []).map((period) => period.lastDate ? `${period.lastDate.year}-${String(period.lastDate.month).padStart(2, "0")}-${String(period.lastDate.day).padStart(2, "0")}` : "");
  return CRUX_METRICS.map((metric) => {
    const values = data.record?.metrics?.[metric.id]?.percentilesTimeseries?.p75s ?? [];
    const points = values.flatMap((value, index) => {
      const number = value === null || value === "NaN" ? NaN : Number(value);
      return Number.isFinite(number) && dates[index] ? [{ date: dates[index], value: number }] : [];
    });
    const latest = points.at(-1)?.value ?? null;
    return { ...metric, points, latest, rating: latest === null ? null : latest <= metric.good ? "good" : latest <= metric.poor ? "needs improvement" : "poor" };
  });
}
