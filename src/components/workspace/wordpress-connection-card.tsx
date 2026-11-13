"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, RotateCcw } from "lucide-react";
import { readJson } from "@/lib/read-json";

type ConnectionStatus = { tokenIssued: boolean; connectedAt: string | null; lastSyncAt: string | null; lastSyncStatus?: string | null; pluginVersion?: string | null; appEditingReady?: boolean };

export function WordPressConnectionCard({ domain, appUrl }: { domain: string; appUrl: string }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sites/" + encodeURIComponent(domain) + "/wordpress-token", { cache: "no-store" })
      .then(async (response) => response.ok ? readJson(response) as Promise<ConnectionStatus> : null)
      .then((data) => { if (!cancelled && data) setStatus(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [domain]);

  async function rotateToken() {
    setBusy(true); setNewToken(""); setMessage(""); setCopied(false);
    try {
      const response = await fetch("/api/sites/" + encodeURIComponent(domain) + "/wordpress-token", { method: "POST" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not issue a connection token.");
      setNewToken(data.token); setStatus((current) => ({ tokenIssued: true, connectedAt: null, lastSyncAt: current?.lastSyncAt ?? null, lastSyncStatus: null, pluginVersion: current?.pluginVersion ?? null, appEditingReady: data.appEditingReady }));
      setMessage("Token created. Copy it now; it will not be shown again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not issue a connection token."); }
    finally { setBusy(false); }
  }

  async function copyToken() {
    if (!newToken) return;
    try { await navigator.clipboard.writeText(newToken); setCopied(true); }
    catch { setMessage("Copy was blocked by the browser. Select the token text and copy it manually."); }
  }

  return <details className="wordpress-connection-card">
    <summary><KeyRound size={14} /> WordPress plugin {status?.connectedAt ? <span className="wordpress-connected">Connected</span> : <span>Setup</span>}</summary>
    <div className="wordpress-connection-content">
      <p>Install the standalone SEO Studio Connector plugin, then set the app URL and token in WordPress under <strong>Settings → SEO Studio</strong>.</p>
      <ol><li>Install the latest <code>wordpress-plugin/seo-studio</code> (v0.5.0 or newer) on your verified WordPress site.</li><li>Generate a token here and enter it in the plugin settings with this app URL: <code>{appUrl}</code>.</li><li>Select <strong>Sync published content now</strong> in WordPress.</li></ol>
      <div className="wordpress-connection-status">{status?.lastSyncAt ? `Last sync: ${new Date(status.lastSyncAt).toLocaleString()} · ${status.lastSyncStatus || "received"}${status.pluginVersion ? ` · plugin ${status.pluginVersion}` : ""}` : "No plugin sync received yet."}</div>
      <div className="wordpress-connection-status">App-initiated metadata updates: {status?.appEditingReady ? "ready after token rotation" : "configure WORDPRESS_TOKEN_ENCRYPTION_KEY and rotate the token"}</div>
      <button type="button" onClick={rotateToken} disabled={busy}><RotateCcw size={13} />{busy ? <><LoaderCircle className="site-spin" size={13} /> Generating…</> : status?.tokenIssued ? "Replace connection token" : "Generate connection token"}</button>
      {newToken && <div className="wordpress-token-value"><code>{newToken}</code><button type="button" onClick={copyToken}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy token"}</button></div>}
      {message && <p className="site-control-message" role="status">{message}</p>}
    </div>
  </details>;
}
