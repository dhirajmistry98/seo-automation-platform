import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Boxes, LockKeyhole } from "lucide-react";
import { GoogleDataCard } from "@/components/workspace/google-data-card";
import { WordPressConnectionCard } from "@/components/workspace/wordpress-connection-card";
import { WordPressContentEditor } from "@/components/workspace/wordpress-content-editor";
import { WordPressSitemapControl } from "@/components/workspace/wordpress-sitemap-control";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";

export const instant = false;

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ integration?: string; service?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships } = workspace;
  const query = await searchParams;
  const statusMessage = query.integration === "connected"
    ? `${query.service || "Google service"} connected. Open its website below to view available reports.`
    : query.integration ? `Google connection could not finish (${query.integration.replaceAll("_", " ")}). Review the OAuth setup and try again.` : "";
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> AUTHORIZED DATA</p><h1>Integrations</h1><p>Connect reporting services per website. Only data your connected accounts can access will appear.</p></div></header>
    <section className="workspace-section workspace-integrations-intro"><span><LockKeyhole size={19} /></span><div><p className="workspace-eyebrow">YOUR CONNECTIONS</p><h2>Control data access by website</h2><p>Google OAuth grants reporting access to Search Console, GA4, Merchant Center, or Business Profile. WordPress uses its own website token and plugin.</p></div><Link href="/dashboard/websites">Manage websites</Link></section>
    {statusMessage && <div className={`workspace-alert${query.integration === "connected" ? " is-success" : ""}`} role="status">{statusMessage}</div>}
    {!workspace.available && <div className="workspace-alert" role="status">Integration status cannot load until MongoDB is running and reachable.</div>}
    {!websites.length ? <section className="workspace-section"><div className="workspace-site-empty"><span><Boxes size={18} /></span><div><strong>{workspace.available ? "No websites to connect" : "Connection data unavailable"}</strong><p>{workspace.available ? "Add and verify a website before creating an integration." : "Start MongoDB or check MONGODB_URI, then refresh this page."}</p></div>{workspace.available && <Link href="/dashboard/websites">Add a website</Link>}</div></section> : <section className="workspace-section workspace-integration-sites"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">WEBSITE CONNECTIONS</p><h2>Available sites</h2><p>Connections are scoped separately for each site and organization.</p></div></div>
      <div className="workspace-integration-list">{websites.map((site) => {
        const role = websiteRole(memberships, site);
        const canConnect = hasOrganizationPermission(role, "integrations.manage");
        const canEditContent = hasOrganizationPermission(role, "content.edit");
        return <article className="workspace-integration-site" key={site.domain}><header><div><span className="workspace-site-mark"><Boxes size={17} /></span><span><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "Verify ownership to connect"}</small></span></div><span className="workspace-integration-role">{canConnect ? "Integration manager" : "Read access"}</span></header>{site.verifiedAt ? <><GoogleDataCard domain={site.domain} canConnect={canConnect} />{canConnect && <WordPressConnectionCard domain={site.domain} appUrl={process.env.NEXT_PUBLIC_APP_URL || ""} />}{canConnect && <WordPressSitemapControl domain={site.domain} />}{canEditContent && <WordPressContentEditor domain={site.domain} />}</> : <p className="workspace-integration-locked">Verify DNS ownership before connecting Google or WordPress.</p>}</article>;
      })}</div>
    </section>}
  </>;
}
