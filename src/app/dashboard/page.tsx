import type { CSSProperties } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Activity, ArrowRight, BarChart3, CheckCircle2, ClipboardList, FileText, Globe2, HeartPulse, Link2, ListTodo, LockKeyhole, MapPin, Radar } from "lucide-react";
import { SearchTrendChart } from "@/components/workspace/search-trend-chart";
import { getWorkspaceData } from "@/lib/workspace-data";
import { OverviewSearchRefresh } from "@/components/workspace/overview-search-refresh";

export const instant = false;

type SearchMetricRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SearchComparisonRow = { clicks?: { current?: number; previous?: number }; impressions?: { current?: number; previous?: number } };
type StoredSearchReport = { websiteDomain: string; organizationId?: unknown; property: string; generatedAt: Date | string; dimension: string; startDate: string; endDate: string; rows?: SearchMetricRow[]; comparisonRows?: SearchComparisonRow[] };
type StoredAiReport = { websiteDomain: string; organizationId?: unknown; kind: string; fetchedAt: Date | string; platform?: string; locationName?: string; countryName?: string; result?: unknown[] };
type StoredReadinessReport = { websiteDomain: string; organizationId?: unknown; calculatedAt: Date | string; scores?: { geo?: number; aeo?: number; llmo?: number } };

function metric(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value); }
type StoredAnswerReport = { websiteDomain: string; brand: string; createdAt: Date; summary: { answered: number; mentioned: number; cited: number; platforms: Array<{ label: string }> } };
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
  let latestAnswers: StoredAnswerReport | null = null;
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
      const [searchReports, aiReports, readinessReports, answerReports] = await Promise.all([
        workspace.db.collection<StoredSearchReport>("google_search_console_reports").find(overviewScope).sort({ generatedAt: -1 }).limit(50).toArray(),
        workspace.db.collection<StoredAiReport>("seo_research_reports").find({ ...overviewScope, kind: "ai_visibility" }).sort({ fetchedAt: -1 }).limit(20).toArray(),
        workspace.db.collection<StoredReadinessReport>("seo_visibility_reports").find(overviewScope).sort({ calculatedAt: -1 }).limit(20).toArray(),
        workspace.db.collection("ai_answer_reports").find(overviewScope, { projection: { websiteDomain: 1, brand: 1, createdAt: 1, summary: 1 } }).sort({ createdAt: -1 }).limit(1).toArray(),
      ]);
      latestAnswers = (answerReports[0] as unknown as StoredAnswerReport | undefined) ?? null;
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
  const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";
  const aiPercent = latestAnswers && latestAnswers.summary.answered ? Math.round((latestAnswers.summary.mentioned / latestAnswers.summary.answered) * 100) : 0;
  const kpis = [
    { href: "/dashboard/websites", icon: Globe2, label: "WEBSITES", value: websites.length, note: websites.length ? "In your workspace" : "Add your first website" },
    { href: "/dashboard/tools", icon: HeartPulse, label: "SEO HEALTH", value: latestAudit?.score ?? "—", note: latestAudit ? "Latest completed audit" : "Available after an audit" },
    { href: "/dashboard/tools", icon: ClipboardList, label: "OPEN TASKS", value: openTaskCount, note: openTaskCount ? "Need attention" : "No open tasks" },
    { href: "/dashboard/integrations", icon: Link2, label: "CONNECTED SOURCES", value: connectedCount || "—", note: connectedCount ? "Google data connections" : "Connect a reporting source" },
  ];
  return <>
    <header className="workspace-page-heading">
      <div><p className="workspace-eyebrow"><span /> SEO STUDIO WORKSPACE</p><h1>Welcome back, <span className="workspace-name-accent">{firstName}</span>.</h1><p>Track your SEO performance and grow your online presence.</p></div>
      <Link href="/dashboard/websites" className="workspace-primary-link">Add a website</Link>
    </header>
    {!ready && <div className="workspace-alert" role="status">Workspace data is temporarily unavailable. Check the database connection and refresh this page.</div>}
    <section className="workspace-kpis workspace-kpis-icons" aria-label="Workspace summary">
      {kpis.map(({ href, icon: Icon, label, value, note }) => <Link href={href} key={label} className="workspace-kpi-card">
        <span className="workspace-kpi-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="workspace-kpi-body"><span>{label}</span><strong>{value}</strong><small>{note}</small></span>
        <ArrowRight size={15} className="workspace-kpi-arrow" aria-hidden="true" />
      </Link>)}
    </section>
    <section className="workspace-performance-grid" aria-label="Organic search and AI visibility overview">
      <article className="workspace-insight-card workspace-organic-card">
        <header><div><p className="workspace-eyebrow"><BarChart3 size={13} /> ORGANIC SEARCH</p><h2>Organic Search Performance</h2><p>Latest saved Google Search Console report</p></div><Link href="/dashboard/integrations" aria-label="Open Search Console reports">Open</Link></header>
        {latestSearchReport ? <>
          <div className="workspace-insight-source"><strong>{latestSearchReport.websiteDomain}</strong><span>{latestSearchReport.startDate} – {latestSearchReport.endDate}</span><time dateTime={reportDateTime(latestSearchReport.generatedAt)}>{reportTime(latestSearchReport.generatedAt)}</time></div>
          <dl className="workspace-organic-metrics">
            <div><dt>Clicks</dt><dd>{metric(organicClicks)}</dd><small>{clicksChange === null ? "No comparison baseline" : `${clicksChange >= 0 ? "+" : ""}${clicksChange.toFixed(1)}% vs prior period`}</small></div>
            <div><dt>Impressions</dt><dd>{metric(organicImpressions)}</dd><small>Search appearances</small></div>
            <div><dt>Average position</dt><dd>{organicPositionImpressions ? (organicPositionWeight / organicPositionImpressions).toFixed(1) : "—"}</dd><small>Lower is a stronger position</small></div>
            <div><dt>Click-through rate</dt><dd>{organicImpressions ? `${organicCtr.toFixed(1)}%` : "—"}</dd><small>Clicks ÷ impressions</small></div>
          </dl>
          {trendRows.length > 1 && <SearchTrendChart rows={trendRows} />}
          {trendRows.length < 2 && <p className="workspace-insight-note">This saved report uses the “{latestSearchReport.dimension}” dimension. Run a date-based report to see a daily trend.</p>}
          <OverviewSearchRefresh domain={latestSearchReport.websiteDomain} property={latestSearchReport.property} startDate={latestSearchReport.startDate} endDate={latestSearchReport.endDate} dimension={latestSearchReport.dimension} />
        </> : <div className="workspace-insight-empty"><span><BarChart3 size={18} /></span><div><strong>No organic search report yet</strong><p>Connect Search Console for a verified site, then run a report to load actual clicks, impressions and position.</p><Link href="/dashboard/integrations">Connect or run a report <ArrowRight size={13} /></Link></div></div>}
        <p className="workspace-insight-footnote">Search Console data is refreshed when a report is run and may be delayed by Google; it is not minute-by-minute analytics.</p>
      </article>
      <article className="workspace-insight-card workspace-ai-card">
        <header><div><p className="workspace-eyebrow"><Radar size={13} /> GEO · AEO · LLMO</p><h2>AI Visibility</h2><p>Provider mentions and crawl-based readiness</p></div><Link href="/dashboard/research" aria-label="Open AI visibility research">Open</Link></header>
        <div className="workspace-ai-ring" style={{ "--ai-pct": aiPercent } as CSSProperties} role="img" aria-label={`AI visibility ${aiPercent}%`}><div><strong>{aiPercent}%</strong><small>{latestAnswers ? "of AI answers mention you" : "AI Visibility"}</small></div></div>
        {latestAnswers ? <div className="workspace-ai-mentions"><span className="workspace-ai-icon"><Radar size={18} /></span><div><strong>{latestAnswers.summary.mentioned}/{latestAnswers.summary.answered}</strong><p>AI answers mention “{latestAnswers.brand}” · {latestAnswers.summary.cited} cite {latestAnswers.websiteDomain}</p><small>{latestAnswers.summary.platforms.map((item) => item.label).join(", ")} · {reportTime(latestAnswers.createdAt)}</small><Link href={`/dashboard/visibility/${encodeURIComponent(latestAnswers.websiteDomain)}#ai-answers`}>Check AI answers again <ArrowRight size={13} /></Link></div></div> : latestAiReport ? <div className="workspace-ai-mentions"><span className="workspace-ai-icon"><Radar size={18} /></span><div><strong>{metric(aiResultCount)}</strong><p>matching rows in the latest {latestAiReport.platform === "chat_gpt" ? "ChatGPT" : "Google AI Overviews"} provider report</p><small>{latestAiReport.websiteDomain} · {latestAiReport.countryName || latestAiReport.locationName || "saved market"} · {reportTime(latestAiReport.fetchedAt)}</small></div></div> : <div className="workspace-insight-empty workspace-ai-empty"><span><Radar size={18} /></span><div><strong>No AI answers checked yet</strong><p>Ask ChatGPT, Claude, Gemini and Perplexity your customers’ questions and see whether they mention or cite you.</p><Link href={websites[0] ? `/dashboard/visibility/${encodeURIComponent(websites[0].domain)}#ai-answers` : "/dashboard/visibility"}>Check AI answers <ArrowRight size={13} /></Link></div></div>}
        <div className="workspace-readiness-heading"><strong>Latest crawl-based readiness</strong>{latestReadinessReport && <small>{latestReadinessReport.websiteDomain} · {reportTime(latestReadinessReport.calculatedAt)}</small>}</div>
        <div className="workspace-readiness-list">{(["geo", "aeo", "llmo"] as const).map((key) => {
          const score = scoreValue(latestReadinessReport?.scores?.[key]);
          return <div key={key}><span>{key.toUpperCase()}</span><div className="workspace-readiness-track"><i style={{ width: `${score ?? 0}%` }} /></div><strong>{score === null ? "—" : `${score}%`}</strong></div>;
        })}</div>
        <div className="workspace-ai-actions"><Link href="/dashboard/research">Run a new AI mentions report <ArrowRight size={13} /></Link><Link href="/dashboard/visibility">Open readiness details</Link></div>
        <p className="workspace-insight-footnote">Readiness scores inspect the latest crawl’s structure and metadata. They are not measured rankings, citations or answers in AI products.</p>
      </article>
    </section>
    <section className="workspace-section workspace-overview-sites" aria-labelledby="recent-sites-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">WEBSITE PORTFOLIO</p><h2 id="recent-sites-title">Your websites</h2><p>Open a site to audit it, review findings, and manage its setup.</p></div><Link className="workspace-text-link" href="/dashboard/websites">View all websites <ArrowRight size={14} /></Link></div>
      {websites.length ? <div className="workspace-overview-site-list">{websites.slice(0, 4).map((site) => <Link className="workspace-overview-site" href="/dashboard/websites" key={site.domain}><span className="workspace-overview-site-icon"><Globe2 size={17} /></span><span className="workspace-overview-site-copy"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "DNS verification needed"}</small></span>{site.lastAudit?.score !== undefined && <span className="workspace-overview-score">{site.lastAudit.score}<small>SEO health</small></span>}</Link>)}</div> : <div className="workspace-site-empty"><span><Globe2 size={18} /></span><div><strong>No websites yet</strong><p>Add a public domain to start collecting real SEO data.</p></div><Link href="/dashboard/websites">Add website</Link></div>}
    </section>
    <section className="workspace-section workspace-overview-next" aria-labelledby="overview-next-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">GET STARTED</p><h2 id="overview-next-title">Choose what to do next</h2><p>Each area has its own page and controls.</p></div></div>
      <div className="workspace-quick-links">
        <Link href="/dashboard/websites"><span><Globe2 size={17} /></span><strong>Manage websites</strong><small>Add domains, run audits, and follow issues.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/tools"><span><ListTodo size={17} /></span><strong>SEO audits & technical fixes</strong><small>Audit pages, prioritize findings, and work through fixes.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/research"><span><MapPin size={17} /></span><strong>Local SEO & rank tracking</strong><small>Target supported countries, cities, and regions in search research.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/visibility"><span><Radar size={17} /></span><strong>GEO, AEO & LLMO</strong><small>Review generative search, answer readiness, and AI visibility signals.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/integrations"><span><LockKeyhole size={17} /></span><strong>Google & WordPress data</strong><small>Connect reporting sources and your WordPress site.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/account"><span><CheckCircle2 size={17} /></span><strong>Account & team</strong><small>Manage workspace roles and account security.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/websites"><span><FileText size={17} /></span><strong>Content & website setup</strong><small>Manage site settings, keywords, and publishing connections.</small><ArrowRight size={15} /></Link>
      </div>
    </section>
    <div className="workspace-storage-state"><span className={`status-dot ${ready ? "is-good" : "is-waiting"}`} />{ready ? "Workspace database connected" : "Workspace database unavailable"}<Activity size={14} /></div>
  </>;
}
