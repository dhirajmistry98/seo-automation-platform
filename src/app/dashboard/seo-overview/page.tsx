import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";
import { loadSiteOverview } from "@/lib/seo/site-overview-data";
import { ColumnChart, DonutChart, LineChart } from "@/components/workspace/charts";
const day = (value: string | Date) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const instant = false;
const fmt = (value: number | null | undefined) => (typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "—");
const tone = (score: number | null) => (score === null ? "none" : score >= 80 ? "good" : score >= 50 ? "ok" : "bad");

function Score({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return <div className="overview-score" data-tone={tone(value)}><span>{label}</span><b>{value ?? "—"}<small>{value === null ? "" : "/100"}</small></b><em>{value === null ? "No data yet" : hint}</em></div>;
}
export default async function SeoOverviewPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { site: requested } = await searchParams;
  const workspace = await getWorkspaceData(session.user.id);
  const sites = workspace.websites.filter((item) => hasOrganizationPermission(websiteRole(workspace.memberships, item), "reports.read"));
  const site = sites.find((item) => item.domain === (typeof requested === "string" ? requested.toLowerCase() : "")) ?? sites[0];
  const o = site ? await loadSiteOverview((await clientPromise).db(), site).catch(() => null) : null;
  const dist = o?.search?.distribution;
  const distRows: Array<[string, number]> = dist ? [["Top 3", dist.top3], ["4–10", dist.pos4to10], ["11–20", dist.pos11to20], ["21–50", dist.pos21to50], ["51–100", dist.pos51to100]] : [];
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> SEO OVERVIEW</p><h1>SEO overview</h1><p>Health, search performance, speed, AI visibility, history and the next best actions for one website.</p></div>{site && <Link href={`/dashboard/report/${encodeURIComponent(site.domain)}`} className="workspace-outline-link">Full report</Link>}</header>
    {sites.length > 1 && <nav className="site-tool-switcher" aria-label="Choose a website">{sites.map((item) => <Link key={item.domain} href={`/dashboard/seo-overview?site=${encodeURIComponent(item.domain)}`} className={item.domain === site?.domain ? "is-current" : ""}>{item.name || item.domain}</Link>)}</nav>}
    {!site ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>Add your website first</strong><p>The overview is built from your site&apos;s own audit, search and speed data.</p></div><Link href="/dashboard/websites">Add your website</Link></div></section>
    : !o ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>The overview could not load</strong><p>Please refresh in a minute.</p></div></div></section>
    : <>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">SCORES</p><h2>{site.domain}</h2><p>{o.scores.performance === null ? "Run an audit, a PageSpeed test and connect Search Console to get your overall score." : `SEO performance combines health (35%), search visibility (25%), speed (20%) and AI visibility (20%). ${o.scores.performanceCoverage}% of that data is available.`}</p></div></div>
        <div className="overview-scores">
          <Score label="SEO performance" value={o.scores.performance} hint={`${o.scores.performanceCoverage}% data coverage`} />
          <Score label="Website health" value={o.scores.health} hint="Latest site audit" />
          <Score label="Search visibility" value={o.scores.searchVisibility} hint="Click potential captured" />
          <Score label="Page speed" value={o.scores.speed} hint="Mobile and desktop average" />
          <Score label="AI visibility" value={o.scores.aiVisibility} hint="Readiness and Gemini mentions" />
        </div>
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">RECOMMENDATIONS</p><h2>What to do next</h2><p>Ordered by impact, from your own data.</p></div></div>
        {o.recommendations.length ? <ol className="overview-actions">{o.recommendations.map((item) => <li key={item.title} data-severity={item.severity}><span>{item.severity}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><Link href={item.href}>Open</Link></li>)}</ol> : <p className="overview-empty">Nothing urgent. Keep running audits and checks to catch changes early.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">ORGANIC SEARCH</p><h2>Search performance</h2><p>{o.search ? `Search Console${o.search.startDate && o.search.endDate ? `, ${o.search.startDate} to ${o.search.endDate}` : ""}.` : "Connect Search Console to see clicks, impressions, positions and keywords."}</p></div></div>
        {o.search ? <div className="overview-grid">
          <div className="overview-stats"><div><b>{fmt(o.search.clicks)}</b><span>clicks{o.search.clicksChange !== null ? ` (${o.search.clicksChange > 0 ? "+" : ""}${o.search.clicksChange}% vs previous)` : ""}</span></div><div><b>{fmt(o.search.impressions)}</b><span>impressions</span></div><div><b>{o.search.ctr}%</b><span>click-through rate</span></div><div><b>{fmt(o.search.averagePosition)}</b><span>average position</span></div><div><b>{fmt(o.search.keywords)}</b><span>organic keywords</span></div>{o.traffic && <><div><b>{fmt(o.traffic.sessions?.current)}</b><span>organic sessions (GA4)</span></div><div><b>{fmt(o.traffic.users?.current)}</b><span>organic users (GA4)</span></div></>}</div>
          <div className="overview-bars"><strong>Ranking distribution</strong><ColumnChart label="Keywords by Google position" data={distRows.map(([label, value]) => ({ label, value }))} /></div>
        </div> : <p className="overview-empty">No Search Console data yet.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">HISTORY</p><h2>Growth trends</h2><p>Built from the reports saved each time you load or run them.</p></div></div>
        <div className="overview-trends"><div><strong>Clicks</strong><LineChart label="Clicks per saved report" points={o.trends.search.map((row) => ({ label: day(row.date), value: row.clicks }))} /></div><div><strong>Impressions</strong><LineChart label="Impressions per saved report" points={o.trends.search.map((row) => ({ label: day(row.date), value: row.impressions }))} /></div><div><strong>Website health</strong><LineChart label="Health score per audit" points={o.trends.health.map((row) => ({ label: day(row.date), value: row.score }))} /></div><div><strong>Page speed</strong><LineChart label="Performance score per test" points={o.trends.speed.map((row) => ({ label: day(row.date), value: row.performance }))} /></div></div>
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">TECHNICAL SEO</p><h2>Technical overview</h2><p>{o.technical ? `${o.technical.pageCount} pages in the latest audit.` : "No audit has been run yet."}</p></div><Link href="/dashboard/tools/audit" className="workspace-outline-link">{o.technical ? "Open audit" : "Run audit"}</Link></div>
        {o.technical ? <div className="overview-grid"><div className="overview-bars"><strong>Issues by severity</strong><DonutChart label="Open issues by severity" slices={[{ label: "Critical", value: o.technical.counts.critical, tone: "bad" }, { label: "Warnings", value: o.technical.counts.warning, tone: "ok" }, { label: "Notices", value: o.technical.counts.notice, tone: "none" }]} /></div>
          <div className="overview-issues"><strong>Most common open issues</strong>{o.technical.topIssues.length ? <ul>{o.technical.topIssues.map((issue) => <li key={issue.title}><span data-severity={issue.severity}>{issue.severity}</span>{issue.title}<b>{issue.count}</b></li>)}</ul> : <p className="overview-empty">No open issues.</p>}</div></div> : <p className="overview-empty">Run a site audit to see issues here.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">AI SEARCH</p><h2>AI visibility</h2><p>Gemini answers and how ready your content is for AI search.</p></div><Link href="/dashboard/visibility" className="workspace-outline-link">Open AI visibility</Link></div>
        <div className="overview-stats">{o.ai.readiness ? <><div><b>{o.ai.readiness.geo}</b><span>GEO readiness</span></div><div><b>{o.ai.readiness.aeo}</b><span>AEO readiness</span></div><div><b>{o.ai.readiness.llmo}</b><span>LLMO readiness</span></div><div><b>{o.ai.readiness.eeat}</b><span>E-E-A-T</span></div></> : <p className="overview-empty">Run the AI readiness report to score GEO, AEO and LLMO.</p>}{o.ai.answers && <><div><b>{o.ai.answers.mentioned}/{o.ai.answers.answered}</b><span>Gemini answers mention you</span></div><div><b>{o.ai.answers.cited}/{o.ai.answers.answered}</b><span>cite your website</span></div></>}</div>
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">NEEDS A DATA PROVIDER</p><h2>Not available yet</h2><p>These cannot be measured from your own data, so they are not shown instead of being guessed.</p></div></div>
        <ul className="overview-missing">{o.needsDataProvider.map((item) => <li key={item}>{item}</li>)}</ul>
        {o.missing.length > 0 && <p className="strategy-note">Connect or run to improve this page: {o.missing.join(", ")}.</p>}
      </section>
    </>}
  </>;
}
