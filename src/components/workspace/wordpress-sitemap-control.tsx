"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";
import { readJson } from "@/lib/read-json";

type SitemapStatus = {
  manager: "wordpress_core" | "seo_plugin" | "unsupported";
  enabled: boolean | null;
  blogPublic: boolean;
  sitemapUrl: string | null;
  pluginVersion: string;
};
const managerLabel: Record<SitemapStatus["manager"], string> = {
  wordpress_core: "WordPress core",
  seo_plugin: "Another SEO plugin",
  unsupported: "Not supported",
};

export function WordPressSitemapControl({ domain }: { domain: string }) {
  const [status, setStatus] = useState<SitemapStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sites/" + encodeURIComponent(domain) + "/wordpress-sitemap", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not read WordPress sitemap status.");
      setStatus(data as SitemapStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read WordPress sitemap status.");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save() {
    if (pendingEnabled === null) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sites/" + encodeURIComponent(domain) + "/wordpress-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: pendingEnabled, approved: true }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not update the WordPress sitemap.");
      setStatus(data as SitemapStatus);
    } catch (caught) {
      throw new Error(caught instanceof Error ? caught.message : "Could not update the WordPress sitemap.");
    } finally {
      setBusy(false);
    }
  }

  const nextEnabled = status?.enabled === false;

  return <>
    <details className="wordpress-content-editor">
      <summary><FileText size={14} /> WordPress sitemap <span>{loading ? "Checking…" : status ? managerLabel[status.manager] : "Unavailable"}</span></summary>
      <div className="wordpress-content-editor-body">
        <div className="wordpress-editor-refresh">
          <p>SEO Studio can manage WordPress core sitemaps. Existing SEO plugins keep ownership of their own sitemap settings.</p>
          <button type="button" onClick={() => { setError(""); setLoading(true); void load(); }} disabled={loading}><RefreshCw size={12} /> Refresh</button>
        </div>
        {loading && <p className="site-control-message" role="status"><LoaderCircle className="site-spin" size={13} /> Checking the connected WordPress site…</p>}
        {!loading && status?.manager === "seo_plugin" && <p className="site-control-message" role="status">A supported SEO plugin owns sitemap output. Change its sitemap settings in WordPress to avoid duplicate or conflicting controls.</p>}
        {!loading && status?.manager === "unsupported" && <p className="site-control-message" role="status">This WordPress installation does not expose the core sitemap API.</p>}
        {!loading && status?.manager === "wordpress_core" && <>
          <p className="site-control-message"><CheckCircle2 size={13} /> WordPress core sitemap is {status.enabled ? "enabled" : "disabled"}.</p>
          {status.sitemapUrl && <a className="wordpress-editor-url" href={status.sitemapUrl} target="_blank" rel="noreferrer">{status.sitemapUrl} <ExternalLink size={12} /></a>}
          {!status.blogPublic && <p className="site-control-message">WordPress is set to discourage search engines. Make the site public in WordPress before enabling its sitemap.</p>}
          <button className="wordpress-editor-save" type="button" disabled={busy || (!status.blogPublic && nextEnabled)} onClick={() => setPendingEnabled(nextEnabled)}>
            {busy ? <LoaderCircle className="site-spin" size={13} /> : <FileText size={13} />}
            {nextEnabled ? "Enable core sitemap" : "Disable core sitemap"}
          </button>
        </>}
        {error && <p className="site-control-message workspace-feedback is-error" role="alert">{error}</p>}
      </div>
    </details>
    <WorkspaceActionDialog
      open={pendingEnabled !== null}
      eyebrow="WORDPRESS SITEMAP"
      title={pendingEnabled ? "Enable the core sitemap?" : "Disable the core sitemap?"}
      description={pendingEnabled ? "WordPress will publish its built-in sitemap index. Site visibility must allow search engines." : "This will disable the WordPress core sitemap endpoint for this site."}
      details={[{ label: "Website", value: domain }, { label: "Sitemap", before: status?.enabled ? "Enabled" : "Disabled", after: pendingEnabled ? "Enabled" : "Disabled" }]}
      confirmLabel={pendingEnabled ? "Enable sitemap" : "Disable sitemap"}
      destructive={pendingEnabled === false}
      onCancel={() => setPendingEnabled(null)}
      onConfirm={save}
    />
  </>;
}
