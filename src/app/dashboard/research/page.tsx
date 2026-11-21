import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export const instant = false;

export default async function ResearchSitesPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> SEARCH INTELLIGENCE</p><h1>SEO research</h1><p>Research keyword demand, check live search positions, and review backlink summaries for a website.</p></div></header>
    {!workspace.available && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute — if this keeps happening, contact support.</div>}
    {workspace.websites.length ? <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">CHOOSE A WEBSITE</p><h2>Research workspace</h2><p>Reports are saved to the selected website and shared with members who can view reports.</p></div></div><div className="workspace-site-list">{workspace.websites.map((site) => <Link className="workspace-site-card workspace-research-site" href={`/dashboard/research/${encodeURIComponent(site.domain)}`} key={site.domain}><span className="workspace-site-mark"><Search size={17} /></span><div className="workspace-site-identity"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "Not verified"}</small></div><span className="workspace-site-settings">Open research</span></Link>)}</div></section> : <div className="workspace-site-empty"><span><Search size={18} /></span><div><strong>Add your website to start researching</strong><p>Keyword and competitor research is saved to a website, so we need to know which site it’s for. Adding one takes less than a minute.</p></div><Link href="/dashboard/websites">Add your website</Link></div>}
  </>;
}
