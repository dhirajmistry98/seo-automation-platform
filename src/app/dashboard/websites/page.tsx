import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Download, Globe2, Settings2 } from "lucide-react";
import { addWebsiteAction } from "@/app/dashboard/actions";
import { SiteAuditControls } from "@/components/workspace/site-audit-controls";
import { SiteIssueManager } from "@/components/workspace/site-issue-manager";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";
import { SubmitButton } from "@/components/ui/submit-button";

export const instant = false;

export default async function WebsitesPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships, organizations } = workspace;
  const query = await searchParams;
  const message = query.site === "added" ? "Website added. Verify ownership before crawling." : query.site === "deleted" ? "Website and its stored SEO data were deleted." : query.site === "exists" ? "This website is already in the selected workspace." : query.site === "invalid" ? "Enter a valid public domain, such as example.com." : query.site === "unavailable" ? "Website could not be saved. Check your database connection." : "";
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> WEBSITE PORTFOLIO</p><h1>Websites</h1><p>Add and manage sites, run technical audits, and review actionable findings.</p></div></header>
    <section className="workspace-section workspace-sites-page">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">ADD A DOMAIN</p><h2>Start with a verified website</h2><p>SEO Studio only crawls a site after you verify its ownership.</p></div></div>
      {workspace.available ? <form action={addWebsiteAction} className="workspace-add-site workspace-add-site-page">
        <label htmlFor="website-domain">Website domain</label>
        <label htmlFor="website-organization">Add to workspace</label>
        <select id="website-organization" name="organizationId" defaultValue="">{organizations.filter((item) => hasOrganizationPermission(item.role, "websites.manage")).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.replaceAll("_", " ")}</option>)}</select>
        <div><Globe2 size={17} aria-hidden="true" /><input id="website-domain" name="domain" type="text" placeholder="example.com" autoComplete="url" required maxLength={2048} /><SubmitButton>Add website</SubmitButton></div>
        {message && <p className={`workspace-form-message${["invalid", "unavailable"].includes(query.site || "") ? " is-error" : ""}`} role="status">{message}</p>}
      </form> : <p className="workspace-alert">Website setup is unavailable until MongoDB is running and reachable.</p>}
    </section>
    <section className="workspace-section workspace-sites-page" aria-labelledby="website-list-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">YOUR SITES</p><h2 id="website-list-title">{websites.length} website{websites.length === 1 ? "" : "s"}</h2><p>Audit history and settings are kept with each website.</p></div></div>
      {websites.length ? <div className="workspace-site-list">{websites.map((site) => {
        const role = websiteRole(memberships, site);
        const canManage = hasOrganizationPermission(role, "websites.manage");
        const canAudit = hasOrganizationPermission(role, "audit.run");
        const canManageTasks = hasOrganizationPermission(role, "tasks.manage");
        const canManageIssues = hasOrganizationPermission(role, "issues.manage");
        return <article className="workspace-site-card workspace-site-card-page" key={site.domain}>
          <span className="workspace-site-mark"><Globe2 size={17} /></span>
          <div className="workspace-site-identity"><a href={site.url} target="_blank" rel="noreferrer">{site.name || site.domain}</a><small>{site.domain} · {site.verifiedAt ? "Ownership verified" : "Verify ownership to begin"}{site.detectedCms ? ` · ${site.detectedCms.name} detected` : ""}</small></div>
          <span className={`workspace-site-state${site.status === "connected" ? " is-connected" : ""}`}><i className={`status-dot ${site.status === "connected" ? "is-good" : "is-waiting"}`} />{site.status === "connected" ? "Connected" : "Setup needed"}</span>
          {canManage && <Link className="workspace-site-settings" href={`/dashboard/websites/${encodeURIComponent(site.domain)}`}><Settings2 size={14} /> Configure</Link>}
          <a className="workspace-site-settings" href={`/api/sites/${encodeURIComponent(site.domain)}/report?format=csv`}><Download size={14} /> Export report</a>
          {(canAudit || canManage || canManageTasks) && <SiteAuditControls domain={site.domain} siteUrl={site.url} verifiedAt={site.verifiedAt} lastAudit={site.lastAudit} canManageSite={canManage} canManageTasks={canManageTasks} canRunAudit={canAudit} />}
          {site.lastAudit && <SiteIssueManager domain={site.domain} canManage={canManageIssues} />}
        </article>;
      })}</div> : <div className="workspace-site-empty"><span><Globe2 size={18} /></span><div><strong>{workspace.available ? "No websites yet" : "Website list unavailable"}</strong><p>{workspace.available ? "Add a public domain above, then verify the DNS record before running the first audit." : "The application could not read website data from MongoDB."}</p></div></div>}
    </section>
  </>;
}
