import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Check, Download, Globe2, Settings2 } from "lucide-react";
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
  let openTaskCount = 0;
  let connectedCount = 0;
  if (workspace.db) {
    try {
      [openTaskCount, connectedCount] = await Promise.all([
        workspace.db.collection("seo_tasks").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: { $ne: "done" } }),
        workspace.db.collection("google_connections").countDocuments({ organizationId: { $in: workspace.organizationIds }, status: "connected" }),
      ]);
    } catch { /* counts stay at zero when the database is unreachable */ }
  }
  const latestAudit = websites.find((site) => site.lastAudit?.score !== undefined)?.lastAudit;
  const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";
  const manageableOrgs = organizations.filter((item) => hasOrganizationPermission(item.role, "websites.manage"));
  const steps = [
    { title: "Add your website", text: "Paste your domain above. Takes seconds.", done: websites.length > 0, href: "#website-domain" },
    { title: "Connect Search Console", text: "Load real clicks, impressions and position.", done: connectedCount > 0, href: "/dashboard/integrations" },
    { title: "Run your first audit", text: "Get a health score and a task list.", done: Boolean(latestAudit), href: "#website-list-title" },
  ];
  const currentStep = steps.findIndex((step) => !step.done);
  return <>
    <section className="ws2-site-hero" aria-labelledby="site-hero-title">
      <p className="ws2-site-eyebrow">SEO STUDIO WORKSPACE</p>
      <h1 id="site-hero-title">Welcome back, {firstName}.<span>Which site are we growing?</span></h1>
      <p className="ws2-site-lede">Add a website to start tracking rankings, health and AI visibility in one place.</p>
      {workspace.available ? <form action={addWebsiteAction} className="ws2-site-form">
        {manageableOrgs.length > 1 ? <select name="organizationId" defaultValue="" aria-label="Add to workspace">{manageableOrgs.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select> : manageableOrgs[0] && <input type="hidden" name="organizationId" value={manageableOrgs[0].id} />}
        <input id="website-domain" name="domain" type="text" placeholder="https://yourwebsite.com" autoComplete="url" required maxLength={2048} aria-label="Website address" />
        <SubmitButton>Add a website</SubmitButton>
      </form> : <p className="workspace-alert">Website setup is unavailable until MongoDB is running and reachable.</p>}
      {message && <p className={`workspace-form-message${["invalid", "unavailable"].includes(query.site || "") ? " is-error" : ""}`} role="status">{message}</p>}
      <p className="ws2-site-try">Or try: <Link href="/dashboard/seo-checker">Quick SEO check</Link><Link href="/dashboard/rank-a-page">Rank a page</Link><Link href="/dashboard/visibility">Check AI answers</Link></p>
    </section>
    <ol className="ws2-site-steps">
      {steps.map((step, index) => <li key={step.title} className={step.done ? "is-done" : index === currentStep ? "is-current" : ""}>
        <Link href={step.href}><span className="ws2-step-num">{step.done ? <Check size={14} aria-hidden="true" /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.text}</small></span></Link>
      </li>)}
    </ol>
    <dl className="ws2-site-stats">
      <div><dt>WEBSITES</dt><dd>{websites.length}</dd></div>
      <div><dt>SEO HEALTH</dt><dd>{latestAudit?.score ?? "—"}</dd></div>
      <div><dt>OPEN TASKS</dt><dd>{openTaskCount}</dd></div>
      <div><dt>CONNECTED SOURCES</dt><dd>{connectedCount || "—"}</dd></div>
    </dl>
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
