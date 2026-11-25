import Link from "next/link";
import { ColumnChart, DonutChart, MiniArea, RingScore } from "@/components/workspace/charts";
import { TrendExplorer, type ExplorerTab } from "@/components/workspace/trend-explorer";
import type { SiteOverview } from "@/lib/seo/site-overview";

const fmt = (value: number | null | undefined, digits = 1) => (typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: digits }) : "—");
const badge = (score: number | null): { text: string; tone: "good" | "ok" | "bad" | "none" } => (score === null ? { text: "No data", tone: "none" } : score >= 80 ? { text: "Good", tone: "good" } : score >= 50 ? { text: "Fair", tone: "ok" } : { text: "Low", tone: "bad" });
const t = (value: string | Date) => new Date(value).getTime();
const label = (value: string | Date) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function Change({ value }: { value: number | null }) { return value === null ? null : <em className="sx-change" data-up={value >= 0}>{value > 0 ? "+" : ""}{value}%</em>; }
function Row({ name, value }: { name: string; value: string | number }) { return <div className="sx-row"><span>{name}</span><b>{value}</b></div>; }
function Card({ title, hint, action, children }: { title: string; hint?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return <article className="sx-card"><header><div><h3>{title}</h3>{hint && <small>{hint}</small>}</div>{action && <Link href={action.href}>{action.label}</Link>}</header>{children}</article>;
}
function Provider({ items }: { items: string[] }) { return <div className="sx-provider"><b>Needs a data provider</b><p>This cannot be measured from your own data, so it is not estimated.</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>; }

export function SeoOverviewView({ domain, o }: { domain: string; o: SiteOverview }) {
  const s = o.scores, search = o.search, history = o.trends.search;
  const vis = badge(s.searchVisibility), ai = badge(s.aiVisibility), perf = badge(s.performance), health = badge(s.health);
  const tabs: ExplorerTab[] = [
    { key: "search", label: "Search Console", emptyText: "No Search Console data yet.", emptyHref: "/dashboard/integrations", emptyLabel: "Connect Search Console",
      series: [
        { key: "clicks", label: "Clicks", color: "#4f46e5", axis: "left", defaultOn: true, points: history.map((row) => ({ t: t(row.date), label: label(row.date), value: row.clicks })) },
        { key: "impressions", label: "Impressions", color: "#2e9d57", axis: "right", defaultOn: true, points: history.map((row) => ({ t: t(row.date), label: label(row.date), value: row.impressions })) },
        { key: "keywords", label: "Keywords", color: "#d49a1d", axis: "left", defaultOn: false, points: history.flatMap((row) => typeof row.keywords === "number" ? [{ t: t(row.date), label: label(row.date), value: row.keywords }] : []) },
      ] },
    { key: "scores", label: "Scores", emptyText: "No audit or speed test saved yet.", emptyHref: "/dashboard/tools/audit", emptyLabel: "Run a site audit",
      series: [
        { key: "health", label: "Website health", color: "#2e9d57", axis: "left", defaultOn: true, points: o.trends.health.map((row) => ({ t: t(row.date), label: label(row.date), value: row.score })) },
        { key: "speed", label: "Page speed", color: "#4f46e5", axis: "left", defaultOn: true, points: o.trends.speed.map((row) => ({ t: t(row.date), label: label(row.date), value: row.performance })) },
      ] },
  ];
  const dist = search?.distribution;
  const distRows = dist ? [{ label: "Top 3", value: dist.top3 }, { label: "4–10", value: dist.pos4to10 }, { label: "11–20", value: dist.pos11to20 }, { label: "21–50", value: dist.pos21to50 }, { label: "51–100", value: dist.pos51to100 }] : [];
  const metricsOf = (device: "mobile" | "desktop") => Object.entries(o.speed.metrics?.[device] ?? {});
  return <div className="sx">
    <section className="sx-kpis" aria-label="Key metrics">
      <div className="sx-kpi"><span>Organic traffic</span><div className="sx-big"><b>{search ? fmt(search.clicks, 0) : "—"}</b><Change value={search?.clicksChange ?? null} /></div>{search ? <Row name="Organic keywords" value={fmt(search.keywords, 0)} /> : <p className="sx-hint">Connect Search Console</p>}<MiniArea values={history.map((row) => row.clicks)} label="Clicks over time" /></div>
      <div className="sx-kpi"><span>Search visibility</span><div className="sx-big"><b>{s.searchVisibility ?? "—"}</b><i className="sx-badge" data-tone={vis.tone}>{vis.text}</i></div>{search ? <><Row name="Average position" value={fmt(search.averagePosition)} /><Row name="Click-through rate" value={`${search.ctr}%`} /><Row name="Impressions" value={fmt(search.impressions, 0)} /></> : <p className="sx-hint">Needs Search Console data</p>}</div>
      <div className="sx-kpi"><span>AI visibility</span><div className="sx-big"><b>{s.aiVisibility ?? "—"}</b><i className="sx-badge" data-tone={ai.tone}>{ai.text}</i></div>{o.ai.answers ? <><Row name="Gemini mentions you" value={`${o.ai.answers.mentioned}/${o.ai.answers.answered}`} /><Row name="Cites your site" value={`${o.ai.answers.cited}/${o.ai.answers.answered}`} /></> : <p className="sx-hint">Run a Gemini check</p>}{o.ai.readiness && <Row name="AI readiness" value={s.readiness ?? "—"} />}</div>
      <div className="sx-kpi"><span>SEO performance</span><div className="sx-big"><b>{s.performance ?? "—"}</b><i className="sx-badge" data-tone={perf.tone}>{perf.text}</i></div><p className="sx-hint">{s.performance === null ? "Run an audit and a speed test" : `${s.performanceCoverage}% of the data is available`}</p></div>
      <div className="sx-kpi sx-kpi-ring"><span>Site health</span><div className="sx-ring-row"><RingScore value={s.health} suffix="%" label="Website health" size={72} /><div><i className="sx-badge" data-tone={health.tone}>{health.text}</i></div></div>{o.technical && <><Row name="Errors" value={o.technical.counts.critical} /><Row name="Warnings" value={o.technical.counts.warning} /></>}</div>
    </section>

    <section className="sx-panel"><TrendExplorer tabs={tabs} /></section>

    <h2 className="sx-h">Site performance</h2>
    <div className="sx-pair">
      <Card title="Page speed" hint="Google Lighthouse" action={{ href: "/dashboard/tools/pagespeed", label: s.speed === null ? "Run PageSpeed" : "Open report" }}>
        {s.speed === null ? <p className="sx-empty">No speed test saved yet. Run PageSpeed to see scores and load metrics.</p> : <>
          <div className="sx-rings"><div><RingScore value={o.speed.mobile} label="Mobile performance" size={76} /><small>Mobile</small></div><div><RingScore value={o.speed.desktop} label="Desktop performance" size={76} /><small>Desktop</small></div></div>
          {metricsOf("mobile").length > 0 && <div className="sx-metrics">{metricsOf("mobile").map(([name, value]) => <Row key={name} name={`${name} (mobile)`} value={value} />)}</div>}</>}
      </Card>
      <Card title="Site audit" hint={o.technical ? `${o.technical.pageCount} pages crawled` : undefined} action={{ href: "/dashboard/tools/audit", label: o.technical ? "Open audit" : "Run audit" }}>
        {!o.technical ? <p className="sx-empty">No audit yet. Run one to see errors, warnings and the most common problems.</p> : <>
          <DonutChart label="Open issues by severity" slices={[{ label: "Errors", value: o.technical.counts.critical, tone: "bad" }, { label: "Warnings", value: o.technical.counts.warning, tone: "ok" }, { label: "Notices", value: o.technical.counts.notice, tone: "none" }]} />
          {o.technical.topIssues.length > 0 && <ul className="sx-list">{o.technical.topIssues.slice(0, 5).map((issue) => <li key={issue.title}><i data-severity={issue.severity}>{issue.severity}</i><span>{issue.title}</span><b>{issue.count}</b></li>)}</ul>}</>}
      </Card>
    </div>

    <h2 className="sx-h">Analysis</h2>
    <div className="sx-pair">
      <Card title="Keyword rankings" hint="Where your search queries rank on Google" action={{ href: "/dashboard/strategy", label: "Keyword strategy" }}>
        {search ? <ColumnChart label="Keywords by Google position" data={distRows} empty="No ranking data yet." /> : <p className="sx-empty">Connect Search Console to see how your keywords are distributed by position.</p>}
      </Card>
      <Card title="Competitors" hint="Domains you track">
        {o.competitors && o.competitors.length > 0 ? <ul className="sx-list">{o.competitors.map((name) => <li key={name}><span>{name}</span></li>)}</ul> : <p className="sx-empty">No competitors saved. Add them in your website settings.</p>}
        <Provider items={["Competitor traffic and keywords", "Competitor backlinks", "Share of voice"]} />
      </Card>
    </div>

    <h2 className="sx-h">Improvements</h2>
    <div className="sx-pair">
      <Card title="What to do next" hint="Ordered by impact">
        {o.recommendations.length ? <ol className="sx-actions">{o.recommendations.slice(0, 6).map((item) => <li key={item.title} data-severity={item.severity}><div><b>{item.title}</b><p>{item.detail}</p></div><Link href={item.href}>Open</Link></li>)}</ol> : <p className="sx-empty">Nothing urgent. Keep running audits and checks to catch changes early.</p>}
      </Card>
      <Card title="Backlinks and authority" hint="Referring domains, toxicity, Authority Score">
        <Provider items={o.needsDataProvider} />
        {o.missing.length > 0 && <p className="sx-hint">To improve this page connect or run: {o.missing.join(", ")}.</p>}
      </Card>
    </div>
    <p className="sx-foot">{domain}</p>
  </div>;
}
