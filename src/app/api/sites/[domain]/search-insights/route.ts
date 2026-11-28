import { guardSitePost, failure, noStore } from "@/lib/security/site-request";
import { searchConsoleLookup } from "@/lib/integrations/free-research";
import { googleApiError } from "@/lib/integrations/google";
import { brandSplit, contentDecay, dailyTrend, distribution, landingPages, lowCtr, movements, toMetrics, totals, trackedKeywords, type GscRow } from "@/lib/seo/search-insights";

export const maxDuration = 60;
type Context = { params: Promise<{ domain: string }> };
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"];
const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export async function POST(request: Request, context: Context) {
  const guard = await guardSitePost<{ days?: unknown; country?: unknown; device?: unknown }>(request, context.params, { permission: "reports.read", bucket: "search-insights", limit: 20 });
  if (guard.response) return guard.response;
  const { db, domain, website, body } = guard;
  const days = [7, 28, 90].includes(Number(body.days)) ? Number(body.days) : 28;
  const country = typeof body.country === "string" && /^[a-z]{3}$/i.test(body.country) ? body.country.toLowerCase() : "";
  const device = typeof body.device === "string" && DEVICES.includes(body.device) ? body.device : "";

  const lookup = await searchConsoleLookup(db, website.organizationId, domain);
  if (lookup.status !== "ok") return failure(lookup.message, lookup.status === "api_error" ? 502 : 409);
  const { accessToken, property } = lookup.context;
  // Search Console data is usually complete only up to about three days ago.
  const end = Date.now() - 3 * DAY, start = end - (days - 1) * DAY;
  const current = { startDate: iso(start), endDate: iso(end) };
  const previous = { startDate: iso(start - days * DAY), endDate: iso(start - DAY) };
  const filters = [...(country ? [{ dimension: "country", operator: "equals", expression: country }] : []), ...(device ? [{ dimension: "device", operator: "equals", expression: device }] : [])];
  const query = async (range: typeof current, dimensions: string[], rowLimit: number, filtered = true) => {
    const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...range, dimensions, rowLimit, ...(filtered && filters.length ? { dimensionFilterGroups: [{ filters }] } : {}) }),
    });
    if (!response.ok) throw new Error(await googleApiError(response, "Search Console data could not be read."));
    return (((await response.json().catch(() => ({}))) as { rows?: GscRow[] }).rows) ?? [];
  };

  try {
    const [queries, priorQueries, pages, priorPages, daily, countries] = await Promise.all([
      query(current, ["query"], 5000), query(previous, ["query"], 5000), query(current, ["page"], 1000), query(previous, ["page"], 1000),
      query(current, ["date", "query"], 25000), query(current, ["country"], 60, false),
    ]);
    const now = toMetrics(queries), before = toMetrics(priorQueries), pageNow = toMetrics(pages), pageBefore = toMetrics(priorPages);
    const ga4 = await db.collection("google_analytics_reports").findOne({ organizationId: website.organizationId, websiteDomain: domain }, { sort: { generatedAt: -1 }, projection: { "report.landingPages": 1, "report.dateRange": 1 } }).catch(() => null);
    const ga4Rows = Array.isArray(ga4?.report?.landingPages) ? (ga4.report.landingPages as unknown[]) : [];
    const keywords = Array.isArray(website.primaryKeywords) ? website.primaryKeywords.filter((item: unknown): item is string => typeof item === "string").slice(0, 30) : [];
    return Response.json({
      period: current, previousPeriod: previous, filters: { country, device, days },
      countries: toMetrics(countries).sort((a, b) => b.impressions - a.impressions).map((row) => row.key),
      totals: totals(now), previousTotals: totals(before),
      distribution: distribution(now), previousDistribution: distribution(before),
      trend: dailyTrend(daily), trendTruncated: daily.length >= 25000,
      tracked: trackedKeywords(keywords, now, before), movements: movements(now, before),
      decay: contentDecay(pageNow, pageBefore), lowCtr: lowCtr(now),
      brand: brandSplit(now, domain, typeof website.name === "string" ? website.name : undefined),
      landing: landingPages(pageNow, ga4Rows), analyticsRange: ga4Rows.length ? ga4?.report?.dateRange ?? null : null,
    }, { headers: noStore });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Search Console is unavailable.", 502);
  }
}
