import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { auth } from "@/auth";
import { loadOverview } from "@/lib/dashboard/overview";
import { KpiCards } from "@/components/workspace/overview/kpi-cards";
import { OrganicSearchCard } from "@/components/workspace/overview/organic-search-card";
import { AiVisibilityCard } from "@/components/workspace/overview/ai-visibility-card";
import { TopKeywordsSection } from "@/components/workspace/overview/top-keywords-section";
import { WebsitesSection } from "@/components/workspace/overview/websites-section";
import { NextStepsSection } from "@/components/workspace/overview/next-steps-section";

export const instant = false;

export default async function DashboardOverview() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const data = await loadOverview(session.user.id);
  const { ready } = data;
  const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";
  return <>
    <header className="workspace-page-heading ws2-hero">
      <div><p className="workspace-eyebrow"><span /> SEO STUDIO WORKSPACE</p><h1>Welcome back, <span className="workspace-name-accent">{firstName}</span>.</h1><p>Track your SEO performance and grow your online presence.</p></div>
      <Link href="/dashboard/websites" className="workspace-primary-link">Add a website</Link>
    </header>
    {!ready && <div className="workspace-alert" role="status">Workspace data is temporarily unavailable. Check the database connection and refresh this page.</div>}
    <KpiCards data={data} />
    <section className="workspace-performance-grid" aria-label="Organic search and AI visibility overview">
      <OrganicSearchCard data={data} />
      <AiVisibilityCard data={data} />
    </section>
    <TopKeywordsSection data={data} />
    <WebsitesSection data={data} />
    <NextStepsSection />
    <div className="workspace-storage-state"><span className={`status-dot ${ready ? "is-good" : "is-waiting"}`} />{ready ? "Workspace database connected" : "Workspace database unavailable"}<Activity size={14} /></div>
  </>;
}
