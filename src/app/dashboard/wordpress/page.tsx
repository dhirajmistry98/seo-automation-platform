import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Boxes, Download, PlugZap } from "lucide-react";
import { WordPressConnectionCard } from "@/components/workspace/wordpress-connection-card";
import { WordPressContentEditor } from "@/components/workspace/wordpress-content-editor";
import { WordPressSitemapControl } from "@/components/workspace/wordpress-sitemap-control";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";

export const instant = false;

export default async function WordPressPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships } = workspace;
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> WORDPRESS</p><h1>WordPress</h1><p>Install the SEO Studio plugin, connect each WordPress site with a private token, then manage titles, descriptions, sitemaps and redirects from one place.</p></div></header>
    <section className="workspace-section wp-hero">
      <span className="wp-hero-icon"><PlugZap size={20} aria-hidden="true" /></span>
      <div>
        <p className="workspace-eyebrow">SEO STUDIO CONNECTOR</p>
        <h2>Get the plugin</h2>
        <ol className="wp-steps">
          <li><strong>Download</strong> the plugin zip below.</li>
          <li>In WordPress open <strong>Plugins → Add New → Upload Plugin</strong>, upload the zip and activate it.</li>
          <li>Back here, generate a <strong>connection token</strong> for your site and paste it into <strong>Settings → SEO Studio</strong> in WordPress.</li>
          <li>Click <strong>Sync published content now</strong> in WordPress. Your pages, posts and custom content appear below.</li>
        </ol>
        <a className="wordpress-download" href="/api/plugin/download" download><Download size={14} aria-hidden="true" /> Download plugin (.zip)</a>
        <p className="wp-note">Needs WordPress 6.2+ and PHP 8.0+. Each website uses its own token. Your website must be verified first.</p>
      </div>
    </section>
    {!workspace.available && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute.</div>}
    {!websites.length ? <section className="workspace-section"><div className="workspace-site-empty"><span><Boxes size={18} /></span><div><strong>{workspace.available ? "Add your website first" : "Sites can’t load right now"}</strong><p>{workspace.available ? "Add and verify a website, then connect its WordPress plugin here." : "Please try again shortly."}</p>{workspace.available && <Link href="/dashboard/websites" className="workspace-text-link">Add a website</Link>}</div></div></section> :
      <div className="workspace-integration-list">{websites.map((site) => {
        const role = websiteRole(memberships, site);
        const canConnect = hasOrganizationPermission(role, "integrations.manage");
        const canEditContent = hasOrganizationPermission(role, "content.edit");
        return <article className="workspace-integration-site" key={site.domain}>
          <header><div><span className="workspace-site-mark"><Boxes size={17} /></span><span><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "Verify ownership to connect"}</small></span></div><span className="workspace-integration-role">{canConnect ? "Integration manager" : "Read access"}</span></header>
          {site.verifiedAt ? <>
            {canConnect ? <WordPressConnectionCard domain={site.domain} appUrl={process.env.NEXT_PUBLIC_APP_URL || ""} defaultOpen /> : <p className="workspace-integration-locked">Ask an integration manager to connect WordPress for this site.</p>}
            {canConnect && <WordPressSitemapControl domain={site.domain} />}
            {canEditContent && <WordPressContentEditor domain={site.domain} />}
          </> : <p className="workspace-integration-locked">Confirm you own this website first (Websites → Configure), then you can connect WordPress.</p>}
        </article>;
      })}</div>}
  </>;
}
