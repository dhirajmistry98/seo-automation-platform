/**
 * Per-site SEO overview. Pure functions over data the app already stores.
 * Every score names its inputs. Anything that needs a paid data source is reported as missing, never estimated.
 */
import { expectedCtr, type QueryRow } from "@/lib/seo/keyword-strategy";

export type OverviewInput = {
  audit: { score: number; pageCount: number; issueCounts: { critical: number; warning: number; notice: number }; completedAt?: string | Date | null } | null;
  healthHistory: Array<{ date: string | Date; score: number }>;
  search: { queries: QueryRow[]; history: Array<{ date: string | Date; clicks: number; impressions: number; keywords?: number }>; startDate?: string | null; endDate?: string | null } | null;
  ga4: Record<string, { current: number; previous: number; changePercent: number | null }> | null;
  speed: { mobile: number | null; desktop: number | null; history: Array<{ date: string | Date; performance: number }>; metrics?: Partial<Record<"mobile" | "desktop", Record<string, string>>> };
  competitors?: string[];
  readiness: { geo: number; aeo: number; llmo: number; eeat: number } | null;
  answers: { answered: number; mentioned: number; cited: number } | null;
  openIssues: Array<{ title: string; severity: string }>;
  strategy: { quickWins: number; contentGaps: number } | null;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Share of the click potential captured: impression-weighted expected CTR at each query's position, against ranking first for all of them. */
export function searchVisibilityScore(queries: QueryRow[]) {
  const total = queries.reduce((sum, row) => sum + Math.max(0, row.impressions), 0);
  if (!total) return null;
  const captured = queries.reduce((sum, row) => sum + Math.max(0, row.impressions) * expectedCtr(row.position || 100), 0);
  return clamp((captured / (total * expectedCtr(1))) * 100);
}

export function rankingDistribution(queries: QueryRow[]) {
  const buckets = { top3: 0, pos4to10: 0, pos11to20: 0, pos21to50: 0, pos51to100: 0, beyond100: 0 };
  for (const { position } of queries) {
    if (position <= 3) buckets.top3 += 1; else if (position <= 10) buckets.pos4to10 += 1; else if (position <= 20) buckets.pos11to20 += 1;
    else if (position <= 50) buckets.pos21to50 += 1; else if (position <= 100) buckets.pos51to100 += 1; else buckets.beyond100 += 1;
  }
  return buckets;
}

const WEIGHTS = { health: 35, search: 25, speed: 20, ai: 20 } as const;

/** One headline number: a weighted mean of whichever parts have data, with the share of weight that was available. */
export function performanceScore(parts: { health: number | null; search: number | null; speed: number | null; ai: number | null }) {
  let sum = 0, weight = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const value = parts[key];
    if (typeof value === "number") { sum += value * WEIGHTS[key]; weight += WEIGHTS[key]; }
  }
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  return { score: weight ? clamp(sum / weight) : null, coverage: Math.round((weight / total) * 100) };
}

export type Recommendation = { severity: "high" | "medium" | "low"; title: string; detail: string; href: string };

export function buildOverview(input: OverviewInput) {
  const { audit, search, ga4, speed, readiness, answers } = input;
  const queries = search?.queries ?? [];
  const searchScore = searchVisibilityScore(queries);
  const speedValues = [speed.mobile, speed.desktop].filter((value): value is number => typeof value === "number");
  const speedScore = speedValues.length ? clamp(avg(speedValues) ?? 0) : null;
  const readinessScore = readiness ? clamp((readiness.geo + readiness.aeo + readiness.llmo) / 3) : null;
  const mentionScore = answers && answers.answered > 0 ? clamp((answers.mentioned / answers.answered) * 100) : null;
  const aiScore = readinessScore === null && mentionScore === null ? null : clamp(avg([readinessScore, mentionScore].filter((value): value is number => value !== null)) ?? 0);
  const health = audit ? clamp(audit.score) : null;
  const overall = performanceScore({ health, search: searchScore, speed: speedScore, ai: aiScore });

  const clicks = queries.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = queries.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = impressions ? queries.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : null;

  const issueTitles = new Map<string, { title: string; severity: string; count: number }>();
  for (const issue of input.openIssues) {
    const entry = issueTitles.get(issue.title) ?? { title: issue.title, severity: issue.severity, count: 0 };
    entry.count += 1;
    issueTitles.set(issue.title, entry);
  }
  const rank = { critical: 0, warning: 1, notice: 2 } as Record<string, number>;
  const topIssues = [...issueTitles.values()].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || b.count - a.count).slice(0, 8);

  const history = [...(search?.history ?? [])].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const last = history.at(-1), prev = history.at(-2);
  const clicksChange = last && prev && prev.clicks > 0 ? Math.round(((last.clicks - prev.clicks) / prev.clicks) * 100) : null;
  const sessions = ga4?.sessions ?? null;

  const recommendations: Recommendation[] = [];
  const add = (item: Recommendation) => recommendations.push(item);
  if (!audit) add({ severity: "high", title: "Run your first site audit", detail: "No crawl has been run yet, so health, technical issues and page-level data are unavailable.", href: "/dashboard/tools/audit" });
  else if (audit.issueCounts.critical > 0) add({ severity: "high", title: `Fix ${audit.issueCounts.critical} critical issue${audit.issueCounts.critical === 1 ? "" : "s"}`, detail: "Critical issues such as missing titles, noindex or broken pages can stop pages from ranking.", href: "/dashboard/tools/action-plan" });
  if (!search) add({ severity: "high", title: "Connect Search Console", detail: "Rankings, clicks, impressions and keyword opportunities all come from your Search Console data.", href: "/dashboard/integrations" });
  if (clicksChange !== null && clicksChange <= -20) add({ severity: "high", title: `Clicks fell ${Math.abs(clicksChange)}% since the previous report`, detail: "Check which queries and pages lost traffic, and whether a recent change or an indexing issue is the cause.", href: "/dashboard/strategy" });
  if (sessions && sessions.changePercent !== null && sessions.changePercent <= -20) add({ severity: "high", title: `Organic sessions fell ${Math.abs(Math.round(sessions.changePercent))}%`, detail: "Organic Search sessions in GA4 dropped against the previous period.", href: "/dashboard/integrations" });
  if (speedScore === null) add({ severity: "medium", title: "Run a PageSpeed test", detail: "No Lighthouse result is saved for this site yet.", href: "/dashboard/tools/pagespeed" });
  else if (speedScore < 50) add({ severity: "high", title: `Improve page speed (score ${speedScore})`, detail: "Slow pages lose visitors and can hold back rankings. Open the PageSpeed report for the biggest fixes.", href: "/dashboard/tools/pagespeed" });
  else if (speedScore < 90) add({ severity: "low", title: `Speed is average (score ${speedScore})`, detail: "Work through the PageSpeed opportunities to move into the good range.", href: "/dashboard/tools/pagespeed" });
  if (audit && audit.issueCounts.warning > 0) add({ severity: "medium", title: `Review ${audit.issueCounts.warning} warning${audit.issueCounts.warning === 1 ? "" : "s"}`, detail: "Warnings are not blocking but usually point to easy on-page gains.", href: "/dashboard/tools/action-plan" });
  if (input.strategy?.quickWins) add({ severity: "medium", title: `${input.strategy.quickWins} queries are close to the top 3`, detail: "These rank 4–20 with real impressions. Improving their pages is usually the fastest win.", href: "/dashboard/strategy" });
  if (input.strategy?.contentGaps) add({ severity: "medium", title: `${input.strategy.contentGaps} search topics have no matching page`, detail: "People find you for these topics but no page targets them. Create or expand a page for each.", href: "/dashboard/strategy" });
  if (!answers) add({ severity: "low", title: "Check your visibility in Gemini", detail: "No AI answer check has been run yet.", href: "/dashboard/visibility" });
  else if (answers.answered > 0 && answers.mentioned === 0) add({ severity: "medium", title: "Gemini does not mention your brand", detail: "None of the checked questions named you. Improve entity clarity, FAQs and structured data, then check again.", href: "/dashboard/visibility" });
  if (readiness && readinessScore !== null && readinessScore < 50) add({ severity: "medium", title: `AI search readiness is low (${readinessScore})`, detail: "Content and technical signals that help AI answers cite you are weak. Open the readiness report.", href: "/dashboard/visibility" });
  const order = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => order[a.severity] - order[b.severity]);

  const missing = [
    ...(!audit ? ["Site audit"] : []), ...(!search ? ["Search Console"] : []), ...(!ga4 ? ["Google Analytics (GA4)"] : []),
    ...(speedScore === null ? ["PageSpeed"] : []), ...(!readiness ? ["AI readiness report"] : []), ...(!answers ? ["Gemini visibility check"] : []),
  ];

  return {
    scores: { performance: overall.score, performanceCoverage: overall.coverage, health, searchVisibility: searchScore, speed: speedScore, aiVisibility: aiScore, readiness: readinessScore, mentionRate: mentionScore },
    search: search ? { clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0, averagePosition: weightedPosition === null ? null : Math.round(weightedPosition * 10) / 10, keywords: queries.length, distribution: rankingDistribution(queries), clicksChange, startDate: search.startDate ?? null, endDate: search.endDate ?? null } : null,
    traffic: ga4 ? { sessions: ga4.sessions ?? null, users: ga4.activeUsers ?? null, engaged: ga4.engagedSessions ?? null, conversions: ga4.conversions ?? null } : null,
    technical: audit ? { counts: audit.issueCounts, pageCount: audit.pageCount, completedAt: audit.completedAt ?? null, topIssues } : null,
    speed: { mobile: speed.mobile, desktop: speed.desktop, metrics: speed.metrics ?? {} },
    competitors: (input.competitors ?? []).filter((item) => typeof item === "string" && item).slice(0, 10),
    ai: { readiness, answers },
    trends: { search: history, health: [...input.healthHistory].sort((a, b) => +new Date(a.date) - +new Date(b.date)), speed: [...speed.history].sort((a, b) => +new Date(a.date) - +new Date(b.date)) },
    recommendations, missing,
    needsDataProvider: ["Backlinks and referring domains", "Domain authority score", "Competitor overview", "Estimated competitor traffic"],
  };
}
export type SiteOverview = ReturnType<typeof buildOverview>;
