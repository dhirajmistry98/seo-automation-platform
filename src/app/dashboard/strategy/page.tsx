import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Network } from "lucide-react";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { loadSiteSelection } from "@/lib/dashboard/site-selection";
import { SiteSwitcher } from "@/components/workspace/site-switcher";
import { loadKeywordStrategy } from "@/lib/seo/keyword-strategy-data";
import type { Intent } from "@/lib/seo/keyword-strategy";

export const instant = false;
const fmt = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const INTENT_LABEL: Record<Intent, string> = { informational: "Informational", commercial: "Commercial", transactional: "Transactional", navigational: "Navigational / brand" };

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { site: requested } = await searchParams;
  const { sites, site } = await loadSiteSelection(session.user.id, requested);
  const result = site ? await loadKeywordStrategy((await clientPromise).db(), site).catch(() => null) : null;
  const s = result?.strategy;
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> KEYWORD STRATEGY</p><h1>Keyword strategy</h1><p>Topic clusters, search intent, page mapping and content gaps, built from your own Search Console queries and crawled pages.</p></div>{site && s && <a className="workspace-outline-link" href={`/api/sites/${encodeURIComponent(site.domain)}/keyword-strategy?format=csv`}><Download size={15} /> Export CSV</a>}</header>
    <SiteSwitcher sites={sites} current={site?.domain} path="/dashboard/strategy" />
    {!site ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>Add your website first</strong><p>The strategy is built from your site&apos;s own search data.</p></div><Link href="/dashboard/websites">Add your website</Link></div></section>
    : !s ? <section className="workspace-section"><div className="workspace-site-empty"><span><Network size={18} /></span><div><strong>No Search Console data for {site.domain} yet</strong><p>Connect Search Console, then load a query report. The strategy appears here automatically.</p></div><Link href="/dashboard/integrations">Connect Google</Link></div></section>
    : <>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">OVERVIEW</p><h2>{site.domain}</h2><p>{result?.startDate && result?.endDate ? `Search Console data from ${result.startDate} to ${result.endDate}. ` : ""}{result?.pagesCompared ? `${result.pagesCompared} crawled pages compared.` : "Run a site audit to map keywords to your pages."}</p></div></div>
        <div className="strategy-stats">
          <div><b>{fmt(s.totals.queries)}</b><span>queries</span></div><div><b>{fmt(s.totals.clusters)}</b><span>topic clusters</span></div><div><b>{fmt(s.totals.clicks)}</b><span>clicks</span></div><div><b>{fmt(s.totals.impressions)}</b><span>impressions</span></div>
          <div><b>{s.buckets.strong}</b><span>top 3 (strong)</span></div><div><b>{s.buckets.strikingDistance}</b><span>position 4–20</span></div><div><b>{s.buckets.weak}</b><span>below 20 (weak)</span></div>
          <div><b>{s.lengths.longTail}</b><span>long-tail</span></div><div><b>{s.lengths.short}</b><span>short-tail</span></div><div><b>{s.lengths.questions}</b><span>questions</span></div><div><b>{s.branded.branded}</b><span>branded</span></div><div><b>{s.branded.nonBranded}</b><span>non-branded</span></div>
        </div>
        <div className="strategy-intents">{(Object.keys(INTENT_LABEL) as Intent[]).map((intent) => <span key={intent}>{INTENT_LABEL[intent]} <b>{s.intents[intent]}</b></span>)}</div>
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">QUICK WINS</p><h2>Closest to the top 3</h2><p>Queries at position 4–20 with real impressions. The extra-click figure is an estimate using typical click-through rates, not a forecast.</p></div></div>
        {s.quickWins.length ? <div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>Query</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>Est. extra clicks</th><th>Matching page</th></tr></thead><tbody>{s.quickWins.map((row) => <tr key={row.query}><td>{row.query}</td><td>{row.position.toFixed(1)}</td><td>{fmt(row.impressions)}</td><td>{fmt(row.clicks)}</td><td>+{fmt(row.opportunity)}</td><td>{row.page ? <a href={row.page.url} target="_blank" rel="noreferrer">{row.page.url.replace(/^https?:\/\//, "")}</a> : <em>No matching page</em>}</td></tr>)}</tbody></table></div> : <p className="strategy-empty">No queries in the 4–20 range with 50 or more impressions yet.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">CONTENT GAPS</p><h2>Topics with no matching page</h2><p>People find you for these, but no crawled page clearly targets them.</p></div></div>
        {s.contentGaps.length ? <div className="strategy-cards">{s.contentGaps.map((cluster) => <article key={cluster.topic}><strong>{cluster.topic}</strong><small>{cluster.queries.length} queries · {fmt(cluster.impressions)} impressions · avg position {cluster.position}</small><p>{cluster.plan}</p></article>)}</div> : <p className="strategy-empty">{result?.pagesCompared ? "No unmapped topics with 20 or more impressions." : "Run a site audit first so queries can be compared with your pages."}</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">TOPIC CLUSTERS</p><h2>Pillar pages and subtopics</h2><p>Queries grouped by shared words. A cluster of four or more is a pillar candidate.</p></div></div>
        <div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>Topic</th><th>Role</th><th>Intent</th><th>Queries</th><th>Impressions</th><th>Avg position</th><th>Target page</th></tr></thead><tbody>{s.clusters.map((cluster) => <tr key={cluster.topic}><td><details><summary>{cluster.topic}</summary><ul>{cluster.queries.slice(0, 12).map((row) => <li key={row.query}>{row.query} <small>pos {row.position.toFixed(1)}</small></li>)}</ul><p>{cluster.plan}</p></details></td><td>{cluster.role}</td><td>{cluster.intent}</td><td>{cluster.queries.length}</td><td>{fmt(cluster.impressions)}</td><td>{cluster.position}</td><td>{cluster.page ? <a href={cluster.page.url} target="_blank" rel="noreferrer">{cluster.page.url.replace(/^https?:\/\//, "")}</a> : <em>None yet</em>}</td></tr>)}</tbody></table></div>
      </section>
      <p className="strategy-note">Search volume and keyword difficulty are not shown. They need a paid data provider, and this page does not guess them.</p>
    </>}
  </>;
}
