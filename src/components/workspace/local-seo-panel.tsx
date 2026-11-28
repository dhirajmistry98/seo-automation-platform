"use client";

import { useState, type FormEvent } from "react";
import { RingScore } from "@/components/workspace/charts";

type Result = { score: number; findings: Array<{ ok: boolean; title: string; fix: string }>; pages: Array<{ url: string; visible: { name: boolean; address: boolean; phone: boolean }; schema: Array<{ type: string }> }> };

export function LocalSeoPanel({ domain, saved }: { domain: string; saved: { name: string; address: string; phone: string } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/local-seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "The check failed. Please try again."); else setResult(data);
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }
  const yes = (value: boolean) => <em className={value ? "is-up" : "is-down"}>{value ? "Found" : "Missing"}</em>;
  return <section className="workspace-panel gin" aria-label="Local business check">
    <p className="gin-empty">Enter your business details exactly as they appear on your Google Business Profile. We check your home, contact and about pages.</p>
    <form className="gin-filters" onSubmit={submit}>
      <label>Business name<input name="name" required minLength={2} maxLength={120} defaultValue={saved.name} /></label>
      <label className="is-long">Full address<input name="address" required minLength={8} maxLength={300} defaultValue={saved.address} /></label>
      <label>Phone<input name="phone" required type="tel" maxLength={40} defaultValue={saved.phone} /></label>
      <button type="submit" disabled={busy}>{busy ? "Checking…" : "Check my site"}</button>
    </form>
    {error && <p role="alert" className="gin-error">{error}</p>}
    {result && <div role="status">
      <div className="gin-score"><RingScore value={result.score} suffix="%" label="Local SEO checks passed" size={84} /><strong>{result.findings.filter((f) => f.ok).length} of {result.findings.length} checks passed</strong></div>
      <ul className="gin-findings">{result.findings.map((f) => <li key={f.title}><em className={f.ok ? "is-up" : "is-down"}>{f.ok ? "Pass" : "Fix"}</em><div><strong>{f.title}</strong>{!f.ok && <small>{f.fix}</small>}</div></li>)}</ul>
      <div className="gin-scroll"><table className="gin-table"><thead><tr><th>Page</th><th>Name</th><th>Address</th><th>Phone</th><th>Business data</th></tr></thead><tbody>{result.pages.map((p) => <tr key={p.url}><td>{p.url}</td><td>{yes(p.visible.name)}</td><td>{yes(p.visible.address)}</td><td>{yes(p.visible.phone)}</td><td>{p.schema.map((s) => s.type).join(", ") || "None"}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
