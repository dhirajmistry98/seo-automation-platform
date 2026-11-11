import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Activity, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, FileText, Globe2, ListTodo, LockKeyhole, MapPin, Sparkles } from "lucide-react";
import { getWorkspaceData } from "@/lib/workspace-data";
import { OverviewSearchRefresh } from "@/components/workspace/overview-search-refresh";

export const instant = false;

type SearchMetricRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SearchComparisonRow = { clicks?: { current?: number; previous?: number }; impressions?: { current?: number; previous?: number } };
type StoredSearchReport = { websiteDomain: string; organizationId?: unknown; property: string; generatedAt: Date | string; dimension: string; startDate: string; endDate: string; rows?: SearchMetricRow[]; comparisonRows?: SearchComparisonRow[] };
type StoredAiReport = { websiteDomain: string; organizationId?: unknown; kind: string; fetchedAt: Date | string; platform?: string; locationName?: string; countryName?: string; result?: unknown[] };
type StoredReadinessReport = { websiteDomain: string; organizationId?: unknown; calculatedAt: Date | string; scores?: { geo?: number; aeo?: number; llmo?: number } };

function metric(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value); }
function reportTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function reportDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function scoreValue(value: number | undefined) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null; }

export default async function DashboardOverview() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  let websites: Awaited<ReturnType<typeof getWorkspaceData>>["websites"] = [];
  let openTaskCount = 0;
  let connectedCount = 0;
  let latestSearchReport: StoredSearchReport | null = null;
  let latestAiReport: StoredAiReport | null = null;
  let latestReadinessReport: StoredReadinessReport | null = null;
  let ready = false;
  try {
    const workspace = await getWorkspaceData(session.user.id);
    ({ websites } = workspace);
    ready = workspace.available;
    if (workspace.db) {
      openTaskCount = await workspace.db.collection("seo_tasks").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: { $ne: "done" } });
      connectedCount = await workspace.db.collection("google_connections").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: "connected" });
      const overviewScope = { organizationId: { $in: workspace.organizationIds }, websiteDomain: { $in: websites.map((site) => site.domain) } };
      const [searchReports, aiReports, readinessReports] = await Promise.all([
        workspace.db.collection<StoredSearchReport>("google_search_console_reports").find(overviewScope).sort({ generatedAt: -1 }).limit(50).toArray(),
        workspace.db.collection<StoredAiReport>("seo_research_reports").find({ ...overviewScope, kind: "ai_visibility" }).sort({ fetchedAt: -1 }).limit(20).toArray(),
        workspace.db.collection<StoredReadinessReport>("seo_visibility_reports").find(overviewScope).sort({ calculatedAt: -1 }).limit(20).toArray(),
      ]);
      latestSearchReport = searchReports[0] || null;
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
  const trendRows = latestSearchReport?.dimension === "date" ? searchRows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0] || "")).sort((a, b) => (a.keys?.[0] || "").localeCompare(b.keys?.[0] || "")).slice(-21) : [];
  const trendPoints = (key: "clicks" | "impressions") => {
    const values = trendRows.map((row) => Math.max(0, Number(row[key]) || 0));
    const max = Math.max(1, ...values);
    return values.map((value, index) => `${values.length > 1 ? (index / (values.length - 1)) * 720 : 360},${88 - (value / max) * 70}`).join(" ");
  };
  return <>
    <header className="workspace-page-heading">
      <div><p className="workspace-eyebrow"><span /> SEO STUDIO WORKSPACE</p><h1>Welcome back, {session.user.name?.trim().split(/\s+/)[0] || "there"}.</h1><p>Your SEO work, sites, and team activity in one place.</p></div>
      <Link href="/dashboard/websites" className="workspace-primary-link">Add a website <ArrowUpRight size={15} /></Link>
    </header>
    {!ready && <div className="workspace-alert" role="status">Workspace data is temporarily unavailable. Check the database connection and refresh this page.</div>}
    <section className="workspace-kpis" aria-label="Workspace summary">
      <article><span>WEBSITES</span><strong>{websites.length}</strong><small>{websites.length ? "In your workspace" : "Add your first website"}</small></article>
      <article><span>SEO HEALTH</span><strong>{latestAudit?.score ?? "—"}</strong><small>{latestAudit ? "Latest completed audit" : "Available after an audit"}</small></article>
      <article><span>OPEN TASKS</span><strong>{openTaskCount}</strong><small>{openTaskCount ? "Need attention" : "No open tasks"}</small></article>
      <article><span>CONNECTED SOURCES</span><strong>{connectedCount || "—"}</strong><small>{connectedCount ? "Google data connections" : "Connect a reporting source"}</small></article>
    </section>
    <section className="workspace-performance-grid" aria-label="Organic search and AI visibility overview">
      <article className="workspace-insight-card workspace-organic-card">
        <header><div><p className="workspace-eyebrow"><BarChart3 size={13} /> ORGANIC SEARCH</p><h2>Organic Search Performance</h2><p>Latest saved Google Search Console report</p></div><Link href="/dashboard/integrations" aria-label="Open Search Console reports"><ArrowUpRight size={16} /></Link></header>
        {latestSearchReport ? <>
          <div className="workspace-insight-source"><strong>{latestSearchReport.websiteDomain}</strong><span>{latestSearchReport.startDate} – {latestSearchReport.endDate}</span><time dateTime={reportDateTime(latestSearchReport.generatedAt)}>{reportTime(latestSearchReport.generatedAt)}</time></div>
          <dl className="workspace-organic-metrics">
            <div><dt>Clicks</dt><dd>{metric(organicClicks)}</dd><small>{clicksChange === null ? "No comparison baseline" : `${clicksChange >= 0 ? "+" : ""}${clicksChange.toFixed(1)}% vs prior period`}</small></div>
            <div><dt>Impressions</dt><dd>{metric(organicImpressions)}</dd><small>Search appearances</small></div>
            <div><dt>Average position</dt><dd>{organicPositionImpressions ? (organicPositionWeight / organicPositionImpressions).toFixed(1) : "—"}</dd><small>Lower is a stronger position</small></div>
            <div><dt>Click-through rate</dt><dd>{organicImpressions ? `${organicCtr.toFixed(1)}%` : "—"}</dd><small>Clicks ÷ impressions</small></div>
          </dl>
          {trendRows.length > 1 && <div className="workspace-organic-chart">
            <svg viewBox="0 0 720 100" role="img" aria-label="Daily clicks and impressions trend from the latest Search Console report" preserveAspectRatio="none">
              <path d="M0 90H720M0 55H720M0 20H720" />
              <polyline className="is-impressions" points={trendPoints("impressions")} />
              <polyline className="is-clicks" points={trendPoints("clicks")} />
            </svg>
            <div><span className="is-impressions">Impressions</span><span className="is-clicks">Clicks</span><small>Each line is scaled to its own range to show movement.</small></div>
          </div>}
          {trendRows.length < 2 && <p className="workspace-insight-note">This saved report uses the “{latestSearchReport.dimension}” dimension. Run a date-based report to see a daily trend.</p>}
          <OverviewSearchRefresh domain={latestSearchReport.websiteDomain} property={latestSearchReport.property} startDate={latestSearchReport.startDate} endDate={latestSearchReport.endDate} dimension={latestSearchReport.dimension} />
        </> : <div className="workspace-insight-empty"><span><BarChart3 size={18} /></span><div><strong>No organic search report yet</strong><p>Connect Search Console for a verified site, then run a report to load actual clicks, impressions and position.</p><Link href="/dashboard/integrations">Connect or run a report <ArrowRight size={13} /></Link></div></div>}
        <p className="workspace-insight-footnote">Search Console data is refreshed when a report is run and may be delayed by Google; it is not minute-by-minute analytics.</p>
      </article>
      <article className="workspace-insight-card workspace-ai-card">
        <header><div><p className="workspace-eyebrow"><Sparkles size={13} /> GEO · AEO · LLMO</p><h2>AI Visibility</h2><p>Provider mentions and crawl-based readiness</p></div><Link href="/dashboard/research" aria-label="Open AI visibility research"><ArrowUpRight size={16} /></Link></header>
        {latestAiReport ? <div className="workspace-ai-mentions"><span className="workspace-ai-icon"><Sparkles size={18} /></span><div><strong>{metric(aiResultCount)}</strong><p>matching rows in the latest {latestAiReport.platform === "chat_gpt" ? "ChatGPT" : "Google AI Overviews"} provider report</p><small>{latestAiReport.websiteDomain} · {latestAiReport.countryName || latestAiReport.locationName || "saved market"} · {reportTime(latestAiReport.fetchedAt)}</small></div></div> : <div className="workspace-insight-empty workspace-ai-empty"><span><Sparkles size={18} /></span><div><strong>No AI mention report yet</strong><p>Run an AI visibility report for a connected market to see provider observations here.</p><Link href="/dashboard/research">Run AI visibility research <ArrowRight size={13} /></Link></div></div>}
        <div className="workspace-readiness-heading"><strong>Latest crawl-based readiness</strong>{latestReadinessReport && <small>{latestReadinessReport.websiteDomain} · {reportTime(latestReadinessReport.calculatedAt)}</small>}</div>
        <div className="workspace-readiness-list">{(["geo", "aeo", "llmo"] as const).map((key) => {
          const score = scoreValue(latestReadinessReport?.scores?.[key]);
          return <div key={key}><span>{key.toUpperCase()}</span><div className="workspace-readiness-track"><i style={{ width: `${score ?? 0}%` }} /></div><strong>{score === null ? "—" : `${score}%`}</strong></div>;
        })}</div>
        <div className="workspace-ai-actions"><Link href="/dashboard/research">Run a new AI mentions report <ArrowRight size={13} /></Link><Link href="/dashboard/visibility">Open readiness details <ArrowUpRight size={13} /></Link></div>
        <p className="workspace-insight-footnote">Readiness scores inspect the latest crawl’s structure and metadata. They are not measured rankings, citations or answers in AI products.</p>
      </article>
    </section>
    <section className="workspace-section workspace-overview-sites" aria-labelledby="recent-sites-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">WEBSITE PORTFOLIO</p><h2 id="recent-sites-title">Your websites</h2><p>Open a site to audit it, review findings, and manage its setup.</p></div><Link className="workspace-text-link" href="/dashboard/websites">View all websites <ArrowRight size={14} /></Link></div>
      {websites.length ? <div className="workspace-overview-site-list">{websites.slice(0, 4).map((site) => <Link className="workspace-overview-site" href="/dashboard/websites" key={site.domain}><span className="workspace-overview-site-icon"><Globe2 size={17} /></span><span className="workspace-overview-site-copy"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "DNS verification needed"}</small></span>{site.lastAudit?.score !== undefined && <span className="workspace-overview-score">{site.lastAudit.score}<small>SEO health</small></span>}<ArrowUpRight size={15} /></Link>)}</div> : <div className="workspace-site-empty"><span><Globe2 size={18} /></span><div><strong>No websites yet</strong><p>Add a public domain to start collecting real SEO data.</p></div><Link href="/dashboard/websites">Add website</Link></div>}
    </section>
    <section className="workspace-section workspace-overview-next" aria-labelledby="overview-next-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">GET STARTED</p><h2 id="overview-next-title">Choose what to do next</h2><p>Each area has its own page and controls.</p></div></div>
      <div className="workspace-quick-links">
        <Link href="/dashboard/websites"><span><Globe2 size={17} /></span><strong>Manage websites</strong><small>Add domains, run audits, and follow issues.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/tools"><span><ListTodo size={17} /></span><strong>SEO audits & technical fixes</strong><small>Audit pages, prioritize findings, and work through fixes.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/research"><span><MapPin size={17} /></span><strong>Local SEO & rank tracking</strong><small>Target supported countries, cities, and regions in search research.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/visibility"><span><Sparkles size={17} /></span><strong>GEO, AEO & LLMO</strong><small>Review generative search, answer readiness, and AI visibility signals.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/integrations"><span><LockKeyhole size={17} /></span><strong>Google & WordPress data</strong><small>Connect reporting sources and your WordPress site.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/account"><span><CheckCircle2 size={17} /></span><strong>Account & team</strong><small>Manage workspace roles and account security.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/websites"><span><FileText size={17} /></span><strong>Content & website setup</strong><small>Manage site settings, keywords, and publishing connections.</small><ArrowRight size={15} /></Link>
      </div>
    </section>
    <div className="workspace-storage-state"><span className={`status-dot ${ready ? "is-good" : "is-waiting"}`} />{ready ? "Workspace database connected" : "Workspace database unavailable"}<Activity size={14} /></div>
  </>;
}
