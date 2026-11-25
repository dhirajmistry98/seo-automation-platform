import type { Db } from "mongodb";
import { buildOverview, type OverviewInput } from "@/lib/seo/site-overview";
import { loadKeywordStrategy } from "@/lib/seo/keyword-strategy-data";

type Site = { organizationId?: unknown; domain?: unknown; name?: unknown; [key: string]: unknown };
type Rows = Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }>;

/** Gathers everything stored for one site and builds its overview. Each source is optional. */
export async function loadSiteOverview(db: Db, site: Site) {
  const domain = String(site.domain ?? "").toLowerCase();
  const scope = { organizationId: site.organizationId, websiteDomain: domain } as never;
  const safe = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);
  const [audits, scores, reports, ga4, speeds, visibility, answers, issues, strategy] = await Promise.all([
    safe(db.collection("seo_audits").find({ ...(scope as object), status: "completed" } as never).sort({ createdAt: -1 }).limit(1).toArray(), []),
    safe(db.collection("seo_scores").find(scope).sort({ scoredAt: -1 }).limit(20).toArray(), []),
    safe(db.collection("google_search_console_reports").find({ ...(scope as object), dimension: "query" } as never).sort({ generatedAt: -1 }).limit(12).toArray(), []),
    safe(db.collection("google_analytics_reports").find(scope).sort({ generatedAt: -1 }).limit(1).toArray(), []),
    safe(db.collection("pagespeed_results").find(scope).sort({ retrievedAt: -1 }).limit(30).project({ strategy: 1, categories: 1, retrievedAt: 1, labMetrics: 1 }).toArray(), []),
    safe(db.collection("seo_visibility_reports").find(scope).sort({ calculatedAt: -1 }).limit(1).project({ scores: 1 }).toArray(), []),
    safe(db.collection("ai_answer_reports").find(scope).sort({ createdAt: -1 }).limit(1).project({ summary: 1 }).toArray(), []),
    safe(db.collection("seo_issues").find({ ...(scope as object), status: "open" } as never).project({ title: 1, severity: 1 }).limit(1000).toArray(), []),
    safe(loadKeywordStrategy(db, site), null),
  ]);

  const total = (rows: Rows | undefined, key: "clicks" | "impressions") => (rows ?? []).reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  const latest = reports[0] as { rows?: Rows; startDate?: string; endDate?: string } | undefined;
  const search: OverviewInput["search"] = latest?.rows?.length ? {
    queries: latest.rows.flatMap((row) => row.keys?.[0] ? [{ query: String(row.keys[0]), clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, position: Number(row.position) || 0 }] : []),
    history: reports.map((report) => { const item = report as unknown as { generatedAt: Date; rows?: Rows }; return { date: item.generatedAt, clicks: total(item.rows, "clicks"), impressions: total(item.rows, "impressions"), keywords: item.rows?.length ?? 0 }; }),
    startDate: latest.startDate ?? null, endDate: latest.endDate ?? null,
  } : null;

  const speedBy = (strategyName: string) => {
    const row = speeds.find((item) => item.strategy === strategyName) as { categories?: { performance?: number | null } } | undefined;
    return typeof row?.categories?.performance === "number" ? row.categories.performance : null;
  };
  const metricsFor = (strategyName: string) => {
    const row = speeds.find((item) => item.strategy === strategyName) as { labMetrics?: Record<string, { displayValue?: string | null }> } | undefined;
    const pick = (id: string) => row?.labMetrics?.[id]?.displayValue ?? null;
    const entries: Array<[string, string | null]> = [["LCP", pick("largest-contentful-paint")], ["CLS", pick("cumulative-layout-shift")], ["TBT", pick("total-blocking-time")], ["FCP", pick("first-contentful-paint")], ["Speed Index", pick("speed-index")]];
    return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null));
  };
  const audit = audits[0] as { score?: number; pageCount?: number; issueCounts?: { critical: number; warning: number; notice: number }; completedAt?: Date } | undefined;
  const readiness = (visibility[0] as { scores?: OverviewInput["readiness"] } | undefined)?.scores ?? null;
  const summary = (answers[0] as { summary?: { answered: number; mentioned: number; cited: number } } | undefined)?.summary ?? null;
  const comparison = (ga4[0] as { report?: { comparison?: OverviewInput["ga4"] } } | undefined)?.report?.comparison ?? null;

  const input: OverviewInput = {
    audit: audit && typeof audit.score === "number" && audit.issueCounts ? { score: audit.score, pageCount: Number(audit.pageCount) || 0, issueCounts: audit.issueCounts, completedAt: audit.completedAt ?? null } : null,
    healthHistory: scores.flatMap((row) => typeof row.score === "number" && row.scoredAt ? [{ date: row.scoredAt as Date, score: row.score as number }] : []),
    search, ga4: comparison,
    speed: { mobile: speedBy("mobile"), desktop: speedBy("desktop"), metrics: { mobile: metricsFor("mobile"), desktop: metricsFor("desktop") }, history: speeds.flatMap((row) => typeof row.categories?.performance === "number" ? [{ date: row.retrievedAt as Date, performance: row.categories.performance as number }] : []) },
    readiness, answers: summary,
    openIssues: issues.flatMap((row) => row.title ? [{ title: String(row.title), severity: String(row.severity || "notice") }] : []),
    competitors: Array.isArray(site.competitorDomains) ? (site.competitorDomains as unknown[]).filter((item): item is string => typeof item === "string") : [],
    strategy: strategy ? { quickWins: strategy.strategy.quickWins.length, contentGaps: strategy.strategy.contentGaps.length } : null,
  };
  return buildOverview(input);
}
