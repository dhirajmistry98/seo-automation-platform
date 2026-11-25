import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { loadSiteSelection } from "@/lib/dashboard/site-selection";
import { SiteSwitcher } from "@/components/workspace/site-switcher";
import { loadSiteOverview } from "@/lib/seo/site-overview-data";
import { SeoOverviewView } from "@/components/workspace/overview/seo-overview-view";

export const instant = false;
export default async function SeoOverviewPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { site: requested } = await searchParams;
  const { sites, site } = await loadSiteSelection(session.user.id, requested);
  const o = site ? await loadSiteOverview((await clientPromise).db(), site).catch(() => null) : null;
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> SEO OVERVIEW</p><h1>SEO overview</h1><p>Health, search performance, speed, AI visibility, history and the next best actions for one website.</p></div>{site && <Link href={`/dashboard/report/${encodeURIComponent(site.domain)}`} className="workspace-outline-link">Full report</Link>}</header>
    <SiteSwitcher sites={sites} current={site?.domain} path="/dashboard/seo-overview" />
    {!site ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>Add your website first</strong><p>The overview is built from your site&apos;s own audit, search and speed data.</p></div><Link href="/dashboard/websites">Add your website</Link></div></section>
    : !o ? <section className="workspace-section"><div className="workspace-site-empty"><div><strong>The overview could not load</strong><p>Please refresh in a minute.</p></div></div></section>
    : <SeoOverviewView domain={site.domain} o={o} />}
  </>;
}
