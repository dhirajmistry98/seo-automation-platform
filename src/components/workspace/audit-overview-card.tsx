import Link from "next/link";
import { LineChart, RingScore } from "@/components/workspace/charts";
import type { loadAuditOverview } from "@/lib/seo/audit-overview-data";

type Data = NonNullable<Awaited<ReturnType<typeof loadAuditOverview>>>;

const tone = (value: number | null) => (value === null ? "none" : value >= 80 ? "good" : value >= 50 ? "ok" : "bad");
const when = (value: Date | null) => (value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(value) : "—");
function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return <small className="aud-delta">{value === 0 ? "no change" : "first crawl"}</small>;
  return <small className={`aud-delta ${value < 0 ? "is-better" : "is-worse"}`}>{value > 0 ? "+" : ""}{value} since last crawl</small>;
}

export function AuditOverviewCard({ domain, data }: { domain: string; data: Data }) {
  const { overview, counts, speed } = data;
  const { breakdown, themes, topIssues, deltas, total } = overview;
  const rows = [
    { label: "Healthy", value: breakdown.healthy, tone: "good" }, { label: "Have issues", value: breakdown.issues, tone: "warn" },
    { label: "Broken", value: breakdown.broken, tone: "bad" }, { label: "Redirects", value: breakdown.redirect, tone: "info" }, { label: "Blocked by robots.txt", value: breakdown.blocked, tone: "muted" },
  ];
  const sum = rows.reduce((acc, row) => acc + row.value, 0) || 1;
  return <section className="aud" aria-label={`Site audit overview for ${domain}`}>
    <header className="aud-head"><div><p className="workspace-eyebrow"><span /> SITE AUDIT</p><h2>{domain}</h2></div>
      <p>Last crawl {when(data.completedAt)} · {data.pageCount} page{data.pageCount === 1 ? "" : "s"} crawled{data.pagesSampled < data.pageCount ? ` (showing the first ${data.pagesSampled})` : ""}</p></header>

    <div className="aud-top">
      <article className="aud-card aud-health">
        <h3>Site health</h3>
        <div className={`aud-gauge tone-${tone(data.score)}`} style={{ "--p": data.score } as React.CSSProperties} role="img" aria-label={`Site health ${data.score} out of 100`}><div><strong>{data.score}%</strong></div></div>
        <small>{data.previousScore === null ? "First completed crawl" : `${data.score - data.previousScore >= 0 ? "+" : ""}${data.score - data.previousScore} since last crawl`}</small>
      </article>
      <div className="aud-tiles">
        <article className="aud-card aud-tile is-error"><h3>Errors</h3><strong>{counts.critical}</strong><Delta value={deltas?.critical ?? null} /></article>
        <article className="aud-card aud-tile is-warn"><h3>Warnings</h3><strong>{counts.warning}</strong><Delta value={deltas?.warning ?? null} /></article>
        <article className="aud-card aud-tile is-info"><h3>Notices</h3><strong>{counts.notice}</strong><Delta value={deltas?.notice ?? null} /></article>
      </div>
    </div>

    <article className="aud-card">
      <h3>Thematic reports</h3>
      <p className="aud-sub">Each score is the share of crawled pages with no issue in that area.</p>
      <ul className="aud-themes">
        {themes.map((theme) => <li key={theme.key}><RingScore value={theme.percent} suffix="%" label={theme.label} size={58} /><div><strong>{theme.label}</strong><small>{theme.percent === null ? "No pages crawled" : theme.pagesWithIssues === 0 ? "No issues found" : `${theme.pagesWithIssues} of ${total} pages affected`}</small></div></li>)}
        <li><RingScore value={speed.mobile} suffix="%" label="Mobile speed" size={58} /><div><strong>Mobile speed</strong><small>{speed.mobile === null ? "Run a PageSpeed check" : "Google PageSpeed score"}</small></div></li>
        <li><RingScore value={speed.desktop} suffix="%" label="Desktop speed" size={58} /><div><strong>Desktop speed</strong><small>{speed.desktop === null ? "Run a PageSpeed check" : "Google PageSpeed score"}</small></div></li>
      </ul>
    </article>

    <div className="aud-split">
      <article className="aud-card">
        <h3>Crawled pages</h3>
        <div className="aud-stack" role="img" aria-label={rows.map((row) => `${row.label} ${row.value}`).join(", ")}>{rows.filter((row) => row.value > 0).map((row) => <i key={row.label} className={`tone-${row.tone}`} style={{ width: `${(row.value / sum) * 100}%` }} />)}</div>
        <ul className="aud-legend">{rows.map((row) => <li key={row.label}><i className={`tone-${row.tone}`} />{row.label}<b>{row.value}</b></li>)}</ul>
      </article>
      <article className="aud-card">
        <h3>Health over time</h3>
        <LineChart points={data.history.map((point) => ({ label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(point.date), value: point.score }))} label="Site health score by crawl" unit="%" empty="Run a crawl to start the history." />
      </article>
    </div>

    <article className="aud-card">
      <h3>Top issues</h3>
      {topIssues.length === 0 ? <p className="aud-sub">No issues found in this crawl.</p> : <div className="aud-table-wrap"><table className="aud-table">
        <thead><tr><th>Issue</th><th>Type</th><th>Pages</th></tr></thead>
        <tbody>{topIssues.map((issue) => <tr key={issue.ruleId}><td>{issue.title}</td><td><span className={`aud-sev is-${issue.severity}`}>{issue.severity === "critical" ? "Error" : issue.severity === "warning" ? "Warning" : "Notice"}</span></td><td>{issue.pages}</td></tr>)}</tbody>
      </table></div>}
      <p className="aud-sub">Open an issue below to see the affected pages and mark it fixed. <Link href={`/dashboard/websites/${encodeURIComponent(domain)}`}>Website settings</Link></p>
    </article>
  </section>;
}
