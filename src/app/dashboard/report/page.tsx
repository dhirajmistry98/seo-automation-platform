import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileBarChart, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export const instant = false;

export default async function ReportsIndexPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { websites } = await getWorkspaceData(session.user.id);
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> SHARE RESULTS</p><h1>Reports</h1><p>A branded SEO performance report for each website, ready to download as PDF and send to a client or your team.</p></div></header>
    <section className="workspace-section">
      {websites.length ? <div className="workspace-tool-grid">{websites.map((site) => <Link className="workspace-tool-card" key={String(site.domain)} href={`/dashboard/report/${encodeURIComponent(String(site.domain))}`}><span><FileBarChart size={18} aria-hidden="true" /></span><div><h3>{String(site.domain)}</h3><p>Health, issues, PageSpeed, Search Console, keywords and AI readiness.</p></div><small>Open report <ArrowRight size={12} aria-hidden="true" /></small></Link>)}</div>
        : <p className="site-control-message">Add a website first to create a report.</p>}
    </section>
  </>;
}
