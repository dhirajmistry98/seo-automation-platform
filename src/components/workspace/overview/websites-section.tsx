import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import type { OverviewData } from "@/lib/dashboard/overview";

export function WebsitesSection({ data }: { data: OverviewData }) {
  const { websites } = data;
  return (<section className="workspace-section workspace-overview-sites" aria-labelledby="recent-sites-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">WEBSITE PORTFOLIO</p><h2 id="recent-sites-title">Your websites</h2><p>Open a site to audit it, review findings, and manage its setup.</p></div><Link className="workspace-text-link" href="/dashboard/websites">View all websites <ArrowRight size={14} /></Link></div>
      {websites.length ? <div className="workspace-overview-site-list">{websites.slice(0, 4).map((site) => <Link className="workspace-overview-site" href="/dashboard/websites" key={site.domain}><span className="workspace-overview-site-icon"><Globe2 size={17} /></span><span className="workspace-overview-site-copy"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "DNS verification needed"}</small></span>{site.lastAudit?.score !== undefined && <span className="workspace-overview-score">{site.lastAudit.score}<small>SEO health</small></span>}</Link>)}</div> : <div className="workspace-site-empty"><span><Globe2 size={18} /></span><div><strong>No websites yet</strong><p>Add a public domain to start collecting real SEO data.</p></div><Link href="/dashboard/websites">Add website</Link></div>}
    </section>);
}
