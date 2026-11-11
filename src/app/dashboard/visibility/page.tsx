import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export const instant = false;

export default async function VisibilitySitesPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> GENERATIVE &amp; ANSWER SEARCH</p><h1>Search visibility</h1><p>Review GEO, AEO and LLMO technical and content-structure signals for each crawled website.</p></div></header>
    {!workspace.available && <div className="workspace-alert" role="status">Search visibility reports are unavailable because website data could not be loaded from MongoDB.</div>}
    {workspace.websites.length ? <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">CHOOSE A WEBSITE</p><h2>Site readiness reports</h2><p>Analysis uses saved crawl evidence and is scoped to website permissions in your organization.</p></div></div><div className="workspace-site-list">{workspace.websites.map((site) => <Link className="workspace-site-card workspace-research-site" href={`/dashboard/visibility/${encodeURIComponent(site.domain)}`} key={site.domain}><span className="workspace-site-mark"><Sparkles size={17} /></span><div className="workspace-site-identity"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "Not verified"}</small></div><span className="workspace-site-settings">Open report <ArrowUpRight size={13} /></span></Link>)}</div></section> : <div className="workspace-site-empty"><span><Sparkles size={18} /></span><div><strong>Add and verify a website to begin</strong><p>Reports are based on pages crawled from verified websites; this module does not display sample results.</p></div><Link href="/dashboard/websites">Manage websites</Link></div>}
  </>;
}
