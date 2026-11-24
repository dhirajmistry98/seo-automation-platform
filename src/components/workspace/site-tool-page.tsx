import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { SiteAuditControls, type ToolSection } from "@/components/workspace/site-audit-controls";
import { SiteIssueManager } from "@/components/workspace/site-issue-manager";
import { SiteSwitcher } from "@/components/workspace/site-switcher";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";

type Props = { section: Exclude<ToolSection, "all">; path: string; eyebrow: string; title: string; description: string; selectedSite?: string };

/** One dedicated page per site tool: pick a website, then use only that tool's controls. */
export async function SiteToolPage({ section, path, eyebrow, title, description, selectedSite }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships } = workspace;
  const site = websites.find((item) => item.domain === selectedSite) ?? websites[0];
  const role = site ? websiteRole(memberships, site) : null;
  const canManage = hasOrganizationPermission(role, "websites.manage");
  const canAudit = hasOrganizationPermission(role, "audit.run");
  const canManageTasks = hasOrganizationPermission(role, "tasks.manage");
  const canManageIssues = hasOrganizationPermission(role, "issues.manage");
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> {eyebrow}</p><h1>{title}</h1><p>{description}</p></div><Link href="/dashboard/tools" className="workspace-outline-link"><ArrowLeft size={15} /> All SEO tools</Link></header>
    {!workspace.available && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute — if this keeps happening, contact support.</div>}
    {site ? <section className="workspace-section workspace-tool-section">
      <SiteSwitcher sites={websites} current={site.domain} path={path} />
      <article className="workspace-site-card workspace-tool-site" key={site.domain}>
        <div className="workspace-site-identity"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "Verify ownership to use this tool"}</small></div>
        <Link className="workspace-site-settings" href="/dashboard/websites">Website settings</Link>
        {(canAudit || canManage || canManageTasks) ? <SiteAuditControls key={`${section}-${site.domain}`} section={section} domain={site.domain} siteUrl={site.url} verifiedAt={site.verifiedAt} lastAudit={site.lastAudit} canManageSite={canManage} canManageTasks={canManageTasks} canRunAudit={canAudit} /> : <p className="workspace-integration-locked">Your role on this website is read-only. Ask an administrator to run this tool.</p>}
        {section !== "pagespeed" && site.lastAudit && <SiteIssueManager domain={site.domain} canManage={canManageIssues} />}
      </article>
    </section> : <section className="workspace-section"><div className="workspace-site-empty"><div><strong>{workspace.available ? "Add your website to use this tool" : "This tool can’t load right now"}</strong><p>{workspace.available ? "Add your website, confirm you own it, and this tool will be ready." : "We can’t reach your saved data right now. Please refresh in a minute."}</p></div>{workspace.available && <Link href="/dashboard/websites">Add your website</Link>}</div></section>}
  </>;
}
