"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";

type Preview = { found: number; toAdd: string[]; duplicates: number; overLimit: number; existing: number };

export function KeywordTransfer({ domain, canEdit }: { domain: string; canEdit: boolean }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/keywords-transfer`;
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(mode: "preview" | "apply") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, mode }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "Something went wrong."); if (mode === "preview") setPreview(null); }
      else if (mode === "preview") setPreview(data.preview);
      else { setMessage(`Added ${data.applied.added} keywords. You now have ${data.applied.total}. Reload the page to see them in the form.`); setPreview(null); setText(""); }
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 100_000) { setError("That file is too large (100 KB maximum)."); return; }
    setText(await file.text()); setPreview(null); setError(""); setMessage("");
  }

  return <section className="website-settings-card keyword-transfer" aria-label="Import or export keywords">
    <p className="workspace-eyebrow">KEYWORDS: IMPORT AND EXPORT</p>
    <p>Export your keywords and competitors, or import a CSV or JSON list. You can preview before anything is saved. Up to 30 keywords per website.</p>
    <div className="keyword-transfer-actions">
      <a href={`${base}?format=csv`} download><Download size={14} aria-hidden="true" /> Export CSV</a>
      <a href={`${base}?format=json`} download><Download size={14} aria-hidden="true" /> Export JSON</a>
    </div>
    {canEdit ? <>
      <label className="keyword-transfer-file"><Upload size={14} aria-hidden="true" /> Choose a CSV or JSON file<input type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" onChange={(e) => readFile(e.target.files?.[0])} /></label>
      <textarea value={text} onChange={(e) => { setText(e.target.value.slice(0, 100_000)); setPreview(null); }} rows={5} placeholder={"Or paste keywords, one per line:\nseo audit tool\nlocal seo checklist"} aria-label="Keywords to import" />
      <div className="keyword-transfer-actions">
        <button type="button" disabled={busy || text.trim().length < 2} onClick={() => send("preview")}>Preview import</button>
        {preview && preview.toAdd.length > 0 && <button type="button" className="is-primary" disabled={busy} onClick={() => send("apply")}>Add {preview.toAdd.length} keywords</button>}
      </div>
    </> : <p>You have read-only access to this website, so importing is disabled.</p>}
    {preview && <div className="keyword-transfer-preview" role="status">
      <strong>Found {preview.found} keywords.</strong> {preview.toAdd.length} new, {preview.duplicates} already saved{preview.overLimit ? `, ${preview.overLimit} skipped (30 keyword limit)` : ""}.
      {preview.toAdd.length > 0 && <ul>{preview.toAdd.map((k) => <li key={k}>{k}</li>)}</ul>}
    </div>}
    {message && <p role="status" className="keyword-transfer-ok">{message}</p>}
    {error && <p role="alert" className="keyword-transfer-error">{error}</p>}
  </section>;
}
