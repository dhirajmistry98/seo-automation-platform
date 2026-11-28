import { getWorkspaceData } from "@/lib/workspace-data";

export type SearchMetricRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
export type SearchComparisonRow = { clicks?: { current?: number; previous?: number }; impressions?: { current?: number; previous?: number } };
export type StoredSearchReport = { websiteDomain: string; organizationId?: unknown; property: string; generatedAt: Date | string; dimension: string; startDate: string; endDate: string; rows?: SearchMetricRow[]; comparisonRows?: SearchComparisonRow[] };
export type StoredAiReport = { websiteDomain: string; organizationId?: unknown; kind: string; fetchedAt: Date | string; platform?: string; locationName?: string; countryName?: string; result?: unknown[] };
export type StoredReadinessReport = { websiteDomain: string; organizationId?: unknown; calculatedAt: Date | string; scores?: { geo?: number; aeo?: number; llmo?: number } };

export type StoredAnswerReport = { websiteDomain: string; brand: string; createdAt: Date; summary: { answered: number; mentioned: number; cited: number; platforms: Array<{ label: string }> } };

export function metric(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value); }
export function reportTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
export function reportDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
export function scoreValue(value: number | undefined) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null; }

/** Loads everything the Overview page shows, tolerating an unavailable database. */
export async function loadOverview(userId: string) {
  let websites: Awaited<ReturnType<typeof getWorkspaceData>>["websites"] = [];
  let openTaskCount = 0;
  let connectedCount = 0;
  let latestSearchReport: StoredSearchReport | null = null;
  let dateReport: StoredSearchReport | null = null;
  let queryReport: StoredSearchReport | null = null;
  let latestAiReport: StoredAiReport | null = null;
  let latestAnswers: StoredAnswerReport | null = null;
  let latestReadinessReport: StoredReadinessReport | null = null;
  let ready = false;
  try {
    const workspace = await getWorkspaceData(userId);
    ({ websites } = workspace);
    ready = workspace.available;
    if (workspace.db) {
      openTaskCount = await workspace.db.collection("seo_tasks").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: { $ne: "done" } });
      connectedCount = await workspace.db.collection("google_connections").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: "connected" });
      const overviewScope = { organizationId: { $in: workspace.organizationIds }, websiteDomain: { $in: websites.map((site) => site.domain) } };
      const [searchReports, aiReports, readinessReports, answerReports] = await Promise.all([
        workspace.db.collection<StoredSearchReport>("google_search_console_reports").find(overviewScope).sort({ generatedAt: -1 }).limit(50).toArray(),
        workspace.db.collection<StoredAiReport>("seo_research_reports").find({ ...overviewScope, kind: "ai_visibility" }).sort({ fetchedAt: -1 }).limit(20).toArray(),
        workspace.db.collection<StoredReadinessReport>("seo_visibility_reports").find(overviewScope).sort({ calculatedAt: -1 }).limit(20).toArray(),
        workspace.db.collection("ai_answer_reports").find(overviewScope, { projection: { websiteDomain: 1, brand: 1, createdAt: 1, summary: 1 } }).sort({ createdAt: -1 }).limit(1).toArray(),
      ]);
      latestAnswers = (answerReports[0] as unknown as StoredAnswerReport | undefined) ?? null;
      latestSearchReport = searchReports[0] || null;
      dateReport = searchReports.find((report) => report.dimension === "date") || null;
      queryReport = searchReports.find((report) => report.dimension === "query") || null;
      latestAiReport = aiReports[0] || null;
      latestReadinessReport = readinessReports[0] || null;
    }
  } catch (error) { ready = false; console.error("Dashboard overview could not load:", error); }
  const latestAudit = websites.find((site) => site.lastAudit?.score !== undefined)?.lastAudit;
  const searchRows = latestSearchReport?.rows || [];
  const organicClicks = searchRows.reduce((sum, row) => sum + (Number.isFinite(row.clicks) ? Number(row.clicks) : 0), 0);
  const organicImpressions = searchRows.reduce((sum, row) => sum + (Number.isFinite(row.impressions) ? Number(row.impressions) : 0), 0);
  const organicPositionWeight = searchRows.reduce((sum, row) => sum + (Number.isFinite(row.position) && Number.isFinite(row.impressions) ? Number(row.position) * Number(row.impressions) : 0), 0);
  const organicPositionImpressions = searchRows.reduce((sum, row) => sum + (Number.isFinite(row.position) && Number.isFinite(row.impressions) ? Number(row.impressions) : 0), 0);
  const organicCtr = organicImpressions ? (organicClicks / organicImpressions) * 100 : 0;
  const priorClicks = (latestSearchReport?.comparisonRows || []).reduce((sum, row) => sum + (Number.isFinite(row.clicks?.previous) ? Number(row.clicks?.previous) : 0), 0);
  const clicksChange = priorClicks > 0 ? ((organicClicks - priorClicks) / priorClicks) * 100 : null;
  const aiResultCount = latestAiReport?.result?.length ?? 0;
  const trendRows = dateReport ? (dateReport.rows || []).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0] || "")).sort((a, b) => (a.keys?.[0] || "").localeCompare(b.keys?.[0] || "")).slice(-21) : [];
  const aiPercent = latestAnswers && latestAnswers.summary.answered ? Math.round((latestAnswers.summary.mentioned / latestAnswers.summary.answered) * 100) : null; // null = nothing checked yet, which is not the same as 0%
  return { websites, ready, openTaskCount, connectedCount, latestSearchReport, dateReport, queryReport, latestAiReport, latestAnswers, latestReadinessReport, latestAudit, organicClicks, organicImpressions, organicPositionWeight, organicPositionImpressions, organicCtr, clicksChange, aiResultCount, trendRows, aiPercent };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
