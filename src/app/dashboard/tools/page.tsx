import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Activity, BarChart3, FileSearch, Gauge, Link2, ListTodo, Search, ShieldCheck, Sparkles } from "lucide-react";
import { SiteAuditControls } from "@/components/workspace/site-audit-controls";
import { SiteIssueManager } from "@/components/workspace/site-issue-manager";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";

export const instant = false;

const liveTools = [
  { name: "Technical site audits", description: "Crawl verified pages for metadata, indexability, schema, errors, and internal links.", icon: FileSearch, state: "Available" },
  { name: "PageSpeed reports", description: "Load mobile and desktop Lighthouse scores and performance opportunities.", icon: Gauge, state: "Available" },
  { name: "SEO action plans", description: "Turn open audit findings into trackable tasks for your workspace.", icon: ListTodo, state: "Available" },
  { name: "Search Console & GA4", description: "Review verified search performance and authorized traffic reports.", icon: BarChart3, state: "Connect Google" },
  { name: "SEO Authority Index", description: "Calculate a versioned authority estimate from saved backlink, Search Console and crawl evidence.", icon: Activity, state: "Open research" },
  { name: "GEO, AEO & LLMO readiness", description: "Review first-party content and technical signals from the latest site crawl.", icon: Sparkles, state: "Available" },
];
const plannedTools = [
  { name: "Content and internal link opportunities", description: "Deeper clustering and recommendations need broader crawl and content analysis.", icon: Link2 },
  { name: "Approval workflows", description: "Review and approve automated changes before they are applied.", icon: ShieldCheck },
];

export default async function SeoToolsPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships } = workspace;
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> MEASURE & IMPROVE</p><h1>SEO tools</h1><p>Run available analysis and review each site&apos;s findings and action plan.</p></div><Link href="/dashboard/research" className="workspace-outline-link"><Search size={15} /> Open SEO research</Link></header>
    {!workspace.available && <div className="workspace-alert" role="status">SEO tools are paused because website data could not be loaded from MongoDB.</div>}
    <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">READY TO USE</p><h2>Live tools</h2><p>Run them from a verified website. Results are saved in that website’s history.</p></div></div>
      <div className="workspace-tool-grid">{liveTools.map(({ name, description, icon: Icon, state }) => <article className="workspace-tool-card" key={name}><span><Icon size={18} /></span><div><h3>{name}</h3><p>{description}</p></div><small>{state}</small></article>)}</div>
    </section>
    <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">BY WEBSITE</p><h2>Audit and task controls</h2><p>Ownership and team permissions determine which controls are available.</p></div></div>
      {websites.length ? <div className="workspace-site-list">{websites.map((site) => {
        const role = websiteRole(memberships, site);
        const canManage = hasOrganizationPermission(role, "websites.manage");
        const canAudit = hasOrganizationPermission(role, "audit.run");
        const canManageTasks = hasOrganizationPermission(role, "tasks.manage");
        const canManageIssues = hasOrganizationPermission(role, "issues.manage");
        return <article className="workspace-site-card workspace-tool-site" key={site.domain}><span className="workspace-site-mark"><FileSearch size={17} /></span><div className="workspace-site-identity"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "DNS verification required"}</small></div><Link className="workspace-site-settings" href="/dashboard/websites">Website page</Link>{(canAudit || canManage || canManageTasks) && <SiteAuditControls domain={site.domain} siteUrl={site.url} verifiedAt={site.verifiedAt} lastAudit={site.lastAudit} canManageSite={canManage} canManageTasks={canManageTasks} canRunAudit={canAudit} />}{site.lastAudit && <SiteIssueManager domain={site.domain} canManage={canManageIssues} />}</article>;
      })}</div> : <div className="workspace-site-empty"><span><FileSearch size={18} /></span><div><strong>{workspace.available ? "Add a website to use SEO tools" : "Website tools are unavailable"}</strong><p>{workspace.available ? "Site audits and action plans become available after domain verification." : "Start MongoDB or check MONGODB_URI, then refresh this page."}</p></div>{workspace.available && <Link href="/dashboard/websites">Add a website</Link>}</div>}
    </section>
    <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">PROVIDER DEPENDENCIES</p><h2>Still in the roadmap</h2><p>These reports need additional analysis, history, and verified workflows. The app will not show sample data as real results.</p></div></div><div className="workspace-tool-grid">{plannedTools.map(({ name, description, icon: Icon }) => <article className="workspace-tool-card is-planned" key={name}><span><Icon size={18} /></span><div><h3>{name}</h3><p>{description}</p></div><small>Planned</small></article>)}</div></section>
  </>;
}
