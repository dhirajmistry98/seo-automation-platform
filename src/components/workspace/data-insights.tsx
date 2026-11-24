"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

export function DataInsights({ domain }: { domain: string }) {
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ analysis: string; usedConnectedData: boolean; pagesCompared: number } | null>(null);
  const [error, setError] = useState("");

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/data-insights`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pasted }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "The analysis failed. Please try again.");
      else setResult(data);
    } catch { setError("Could not reach the server. Check your connection."); }
    finally { setBusy(false); }
  }

  return <section className="workspace-panel data-insights" aria-label="Find missing keywords with AI">
    <p className="workspace-eyebrow"><span /> AI DATA CHECK</p>
    <h2>Paste your data and find what&apos;s missing</h2>
    <p>Paste a keyword list or a Search Console export. We compare it with your crawled pages and connected Search Console queries for {domain}, and list missing keywords and quick wins. Only what appears in your data is reported.</p>
    <form onSubmit={analyze}>
      <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={7} maxLength={40000} placeholder={"seo audit tool\nlocal seo checklist\n..."} aria-label="Data to analyze" />
      <button type="submit" disabled={busy || pasted.trim().length < 10}><Sparkles size={15} aria-hidden="true" /> {busy ? "Analyzing…" : "Find missing keywords"}</button>
    </form>
    {error && <p role="alert" className="data-insights-error">{error}</p>}
    {result && <div className="data-insights-result" role="status"><pre>{result.analysis}</pre><small>Compared with {result.pagesCompared} crawled pages{result.usedConnectedData ? " and your connected Search Console queries" : "; no Search Console data is connected yet"}.</small></div>}
  </section>;
}
