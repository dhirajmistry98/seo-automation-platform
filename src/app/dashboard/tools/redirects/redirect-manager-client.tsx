"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Download, Loader2, Plus, Trash2 } from "lucide-react";
import type { RedirectRule } from "@/lib/seo/redirects";
import { exportNginx, exportApache, exportVercel, exportCsv } from "@/lib/seo/redirects";

type ExportFormat = "nginx" | "apache" | "vercel" | "csv";

function download(content: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = filename;
  a.click();
}

export function RedirectManagerClient({ websites }: { websites: Array<{ domain: string; name: string }> }) {
  const [domain, setDomain] = useState(websites[0]?.domain ?? "");
  const [redirects, setRedirects] = useState<RedirectRule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newSource, setNewSource] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newType, setNewType] = useState<"301" | "302">("301");
  const [newNote, setNewNote] = useState("");

  const loadRedirects = useCallback((d: string) => {
    if (!d) return;
    fetch(`/api/sites/${encodeURIComponent(d)}/redirects`)
      .then((r) => r.json())
      .then((data) => { setRedirects(data.redirects ?? []); })
      .catch(() => setError("Failed to load redirects."));
  }, []);

  useEffect(() => {
    if (!domain) return;
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/redirects`)
      .then((r) => r.json())
      .then((data) => { if (active) setRedirects(data.redirects ?? []); })
      .catch(() => { if (active) setError("Failed to load redirects."); });
    return () => { active = false; };
  }, [domain]);

  const addRedirect = async () => {
    if (!newSource.trim() || !newDest.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(domain)}/redirects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: newSource, destination: newDest, type: newType, note: newNote }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "The redirect rule could not be saved. Check the source and destination URLs and try again."); return; }
      setNewSource(""); setNewDest(""); setNewNote("");
      void loadRedirects(domain);
    } catch { setError("Could not reach the server. Check your internet connection and try again."); }
    finally { setSaving(false); }
  };

  const removeRedirect = (source: string) => {
    fetch(`/api/sites/${encodeURIComponent(domain)}/redirects?source=${encodeURIComponent(source)}`, { method: "DELETE" })
      .then(() => setRedirects((r) => r ? r.filter((item) => item.source !== source) : r))
      .catch(() => undefined);
  };

  const exportRedirects = (fmt: ExportFormat) => {
    if (!redirects?.length) return;
    const map: Record<ExportFormat, () => [string, string]> = {
      nginx: () => [exportNginx(redirects), `${domain}-redirects.nginx.conf`],
      apache: () => [exportApache(redirects), `${domain}-redirects.htaccess`],
      vercel: () => [exportVercel(redirects), `${domain}-vercel-redirects.json`],
      csv: () => [exportCsv(redirects), `${domain}-redirects.csv`],
    };
    const [content, filename] = map[fmt]();
    download(content, filename);
  };

  return (
    <div className="workspace-section">
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow"><span /> TOOLS</p>
          <h1>Redirect Manager</h1>
          <p>Store and manage 301/302 redirect rules per website. Export as nginx, Apache, Vercel JSON, or CSV.</p>
        </div>
        <Link href="/dashboard/tools" className="workspace-outline-link"><ArrowLeft size={14} /> All tools</Link>
      </header>

      <div className="ai-config-section">
        <div className="ai-form-row" style={{ maxWidth: 360 }}>
          <label>Website</label>
          <div className="ai-select-wrap">
            <select value={domain} onChange={(e) => setDomain(e.target.value)} disabled={!websites.length}>
              {!websites.length && <option value="">No websites added</option>}
              {websites.map((w) => <option key={w.domain} value={w.domain}>{w.name}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
      </div>

      <div className="ai-config-section">
        <h3>Add redirect</h3>
        <div className="redirect-add-form">
          <input type="text" className="redirect-source" placeholder="/old-path" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
          <span className="redirect-arrow">→</span>
          <input type="text" className="redirect-dest" placeholder="/new-path or https://…" value={newDest} onChange={(e) => setNewDest(e.target.value)} />
          <div className="ai-select-wrap redirect-type">
            <select value={newType} onChange={(e) => setNewType(e.target.value as "301" | "302")}>
              <option value="301">301 Permanent</option>
              <option value="302">302 Temporary</option>
            </select>
            <ChevronDown size={13} />
          </div>
          <input type="text" className="redirect-note" placeholder="Note (optional)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <button className="workspace-primary-link ai-run-btn" onClick={addRedirect} disabled={saving || !newSource.trim() || !newDest.trim() || !domain}>
            {saving ? <><Loader2 size={14} className="ai-spin" /> Saving…</> : <><Plus size={14} /> Add</>}
          </button>
        </div>
        {error && <p className="ai-error">{error}</p>}
      </div>

      <div className="ai-config-section">
        <div className="redirect-list-header">
          <h3>{redirects?.length ?? 0} redirect{(redirects?.length ?? 0) !== 1 ? "s" : ""}{domain ? ` for ${domain}` : ""}</h3>
          {redirects !== null && redirects.length > 0 && (
            <div className="redirect-export-row">
              <span>Export:</span>
              {(["nginx", "apache", "vercel", "csv"] as ExportFormat[]).map((fmt) => (
                <button key={fmt} className="workspace-outline-link" onClick={() => exportRedirects(fmt)} style={{ fontSize: 11 }}>
                  <Download size={12} /> {fmt}
                </button>
              ))}
            </div>
          )}
        </div>

        {redirects === null && domain && <p className="ai-saving"><Loader2 size={13} className="ai-spin" /> Loading…</p>}

        {redirects !== null && redirects.length === 0 && domain && (
          <p className="ai-empty">No redirects saved for {domain}. Add one above.</p>
        )}

        {redirects !== null && redirects.length > 0 && (
          <div className="redirect-table-wrap">
            <table className="redirect-table">
              <thead><tr><th>Source</th><th>Destination</th><th>Type</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {redirects.map((r) => (
                  <tr key={r.source}>
                    <td><code>{r.source}</code></td>
                    <td><code>{r.destination}</code></td>
                    <td><span className={`redirect-badge redirect-${r.type}`}>{r.type}</span></td>
                    <td>{r.note ?? ""}</td>
                    <td><button className="ai-kb-delete" onClick={() => removeRedirect(r.source)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
