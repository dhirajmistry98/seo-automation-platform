"use client";

import { useState } from "react";
import { Activity, ArrowUpRight, LoaderCircle } from "lucide-react";

export type AuthoritySnapshot = {
  score: number;
  confidence: number;
  version: string;
  calculatedAt: string;
  components: Record<string, number | null>;
  inputs: { referringDomains: number | null; searchQueryRows: number; crawledPages: number; primaryKeywords: number };
};

const labels: Record<string, string> = {
  backlinkStrength: "Backlink strength · 30%",
  organicVisibility: "Organic visibility · 25%",
  topicalCoverage: "Query coverage · 15%",
  linkProfileQuality: "Link profile signals · 15%",
  technicalTrust: "Technical trust · 15%",
};

export function AuthorityIndexCard({ domain, initialHistory }: { domain: string; initialHistory: AuthoritySnapshot[] }) {
  const [history, setHistory] = useState(initialHistory);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const latest = history[0];

  async function calculate() {
    setBusy(true);
    setMessage("");
    setMissing([]);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/authority`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setMissing(Array.isArray(payload.missing) ? payload.missing.filter((item: unknown): item is string => typeof item === "string") : []);
        throw new Error(payload.error || "Could not calculate the Authority Index.");
      }
      setHistory((previous) => [payload.snapshot as AuthoritySnapshot, ...previous].slice(0, 12));
      setMessage("Authority Index snapshot saved from recent connected data.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not calculate the Authority Index.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="workspace-section authority-index" aria-labelledby="authority-index-title">
    <div className="workspace-section-heading"><div><p className="workspace-eyebrow">AUTHORITY INDEX</p><h2 id="authority-index-title">Search authority estimate</h2><p>A versioned SEO Studio estimate from recent backlink, Search Console, and crawl records. It is not a Google metric or the SEO Health Score.</p></div></div>
    <div className="authority-index-layout">
      <div className="authority-index-summary">
        <span className="authority-index-number">{latest ? latest.score : "—"}<small>{latest ? "/ 100" : "No score yet"}</small></span>
        <p>{latest ? `Confidence ${latest.confidence}/100 · ${new Date(latest.calculatedAt).toLocaleString()} · ${latest.version}` : "Run a backlink summary, a Search Console query report, and an audit first. Add primary keywords in website settings."}</p>
        <button type="button" onClick={calculate} disabled={busy}>{busy ? <><LoaderCircle size={15} className="research-spinner" /> Calculating…</> : <><Activity size={15} /> Calculate from saved data</>}</button>
        {message && <p role={missing.length ? "alert" : "status"} className={missing.length ? "research-error" : "research-success"}>{message}</p>}
        {missing.length > 0 && <ul className="authority-index-missing">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
      </div>
      <div className="authority-index-details">
        <h3>How it is calculated</h3>
        <p>Referring domains and search clicks use logarithmic scales; query coverage compares your configured keywords with Search Console queries. Link profile signals combine referring IP diversity and the provider spam score. Technical trust is the share of sampled crawled pages that use HTTPS, return below 400, and are not marked noindex.</p>
        {latest && <div className="authority-index-components">{Object.entries(labels).map(([key, label]) => <div key={key}><span>{label}</span><strong>{latest.components[key] ?? "—"}</strong></div>)}</div>}
        {latest && <p className="authority-index-sources">Source sample: {latest.inputs.referringDomains ?? "—"} referring domains · {latest.inputs.searchQueryRows} Search Console queries · {latest.inputs.crawledPages} crawled pages · {latest.inputs.primaryKeywords} configured keywords.</p>}
      </div>
    </div>
    {history.length > 1 && <div className="authority-index-history"><h3>Recent snapshots</h3><ol>{history.slice(0, 6).map((item, index) => <li key={`${item.calculatedAt}-${index}`}><span>{new Date(item.calculatedAt).toLocaleDateString()}</span><strong>{item.score}/100</strong><small>confidence {item.confidence}/100</small></li>)}</ol></div>}
    <p className="authority-index-footnote">Snapshots use existing reports and make no paid provider request. Refresh the source reports to update the estimate. <ArrowUpRight size={13} aria-hidden="true" /></p>
  </section>;
}
