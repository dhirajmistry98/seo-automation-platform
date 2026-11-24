import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";
import { loadInternalLinks } from "@/lib/seo/internal-links-data";
import { DEEP_PAGE_DEPTH, EXCESSIVE_LINKS } from "@/lib/seo/internal-links";
import { ColumnChart } from "@/components/workspace/charts";

export const instant = false;
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "") || "/";

export default async function InternalLinksPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { site: requested } = await searchParams;
  const workspace = await getWorkspaceData(session.user.id);
  const sites = workspace.websites.filter((item) => hasOrganizationPermission(websiteRole(workspace.memberships, item), "reports.read"));
  const site = sites.find((item) => item.domain === (typeof requested === "string" ? requested.toLowerCase() : "")) ?? sites[0];
  const result = site ? await loadInternalLinks((await clientPromise).db(), site).catch(() => null) : null;
  const a = result?.analysis;
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> INTERNAL LINKING</p><h1>Internal links</h1><p>How your pages link to each other: click depth, weakly linked and orphan pages, and where to add links.</p></div><Link href="/dashboard/tools/audit" className="workspace-outline-link">Re-run audit</Link></header>
    {sites.length > 1 && <nav className="site-tool-switcher" aria-label="Choose a website">{sites.map((item) => <Link key={item.domain} href={`/dashboard/internal-links?site=${encodeURIComponent(item.domain)}`} className={item.domain === site?.domain ? "is-current" : ""}>{item.name || item.domain}</Link>)}</nav>}
    {!site ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>Add your website first</strong><p>The link analysis uses your site&apos;s latest crawl.</p></div><Link href="/dashboard/websites">Add your website</Link></div></section>
    : !a ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>No crawl data for {site.domain} yet</strong><p>Run a site audit and this page fills in automatically.</p></div><Link href="/dashboard/tools/audit">Run site audit</Link></div></section>
    : <>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">OVERVIEW</p><h2>{site.domain}</h2><p>{result?.pageCount} pages in the latest crawl. Link counts only include pages that were crawled.</p></div></div>
        <div className="strategy-stats"><div><b>{result?.pageCount}</b><span>pages</span></div><div><b>{a.orphans.length}</b><span>orphan pages</span></div><div><b>{a.deep.length}</b><span>deeper than {DEEP_PAGE_DEPTH} clicks</span></div><div><b>{a.excessive.length}</b><span>with {EXCESSIVE_LINKS}+ links</span></div><div><b>{a.suggestions.length}</b><span>link suggestions</span></div></div>
        <div className="overview-trends" style={{ marginTop: 14 }}><div><strong>Inbound links per page</strong><ColumnChart label="Pages by number of internal links pointing to them" data={a.inboundDistribution} /></div><div><strong>Click depth</strong><ColumnChart label="Pages by clicks from the home page" data={a.depthDistribution} /></div></div>
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">OPPORTUNITIES</p><h2>Where to add internal links</h2><p>Weakly linked pages, with related pages that do not link to them yet. Use the page title as the anchor text, or a natural variation.</p></div></div>
        {a.suggestions.length ? <div className="strategy-cards">{a.suggestions.map((item) => <article key={item.target.url}><strong>{item.target.title || short(item.target.url)}</strong><small>{short(item.target.url)} · {item.target.inbound} inbound link{item.target.inbound === 1 ? "" : "s"}</small><p>Add a link with the anchor “{item.anchor}” from:</p><ul>{item.from.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title || short(source.url)}</a></li>)}</ul></article>)}</div> : <p className="strategy-empty">No weakly linked pages with a related page to link from.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">ORPHANS</p><h2>Pages nothing links to</h2><p>These were found in the sitemap or by other means, but no crawled page links to them.</p></div></div>
        {a.orphans.length ? <div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>Page</th><th>Title</th></tr></thead><tbody>{a.orphans.slice(0, 50).map((page) => <tr key={page.url}><td><a href={page.url} target="_blank" rel="noreferrer">{short(page.url)}</a></td><td>{page.title || <em>No title</em>}</td></tr>)}</tbody></table></div> : <p className="strategy-empty">No orphan pages found.</p>}
      </section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">STRUCTURE</p><h2>Most linked pages and deep pages</h2></div></div>
        <div className="overview-grid"><div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>Most linked</th><th>Inbound</th><th>Outbound</th></tr></thead><tbody>{a.topLinked.map((page) => <tr key={page.url}><td><a href={page.url} target="_blank" rel="noreferrer">{short(page.url)}</a></td><td>{page.inbound}</td><td>{page.outbound}</td></tr>)}</tbody></table></div>
        <div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>Deep pages</th><th>Clicks</th></tr></thead><tbody>{a.deep.length ? a.deep.slice(0, 20).map((page) => <tr key={page.url}><td><a href={page.url} target="_blank" rel="noreferrer">{short(page.url)}</a></td><td>{page.depth}</td></tr>) : <tr><td colSpan={2}>No pages are deeper than {DEEP_PAGE_DEPTH} clicks.</td></tr>}</tbody></table></div></div>
      </section>
      <p className="strategy-note">Link equity and anchor-text analysis need the anchor text of each link, which the crawler does not store yet.</p>
    </>}
  </>;
}
