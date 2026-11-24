"use client";

import { useState } from "react";
import { BadgeCheck, Radar } from "lucide-react";

type Item = { question: string; mentioned: boolean; cited: boolean; sources: string[]; snippet: string; error?: string };

export function GeminiVisibility({ domain }: { domain: string }) {
  const [questions, setQuestions] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setResults(null);
    try {
      const list = questions.split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 5);
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/gemini-visibility`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions: list }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "The check failed. Please try again.");
      else setResults(data.results);
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const cited = results?.filter((r) => r.cited).length ?? 0;
  const mentioned = results?.filter((r) => r.mentioned).length ?? 0;

  return <section className="workspace-panel data-insights" aria-label="Check visibility in Gemini">
    <p className="workspace-eyebrow"><span /> GEMINI VISIBILITY</p>
    <h2>Does Gemini mention or cite {domain}?</h2>
    <p>We ask Gemini (with Google Search) the questions your customers ask, then check whether your brand appears in the answer and whether your website is listed as a source. Leave the box empty to use questions based on your saved keywords. This is a snapshot, not a ranking guarantee.</p>
    <form onSubmit={run}>
      <textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={4} maxLength={1200} placeholder={"One question per line (up to 5), for example:\nWhat is the best SEO audit tool for small businesses?"} aria-label="Questions to ask Gemini" />
      <button type="submit" disabled={busy}><Radar size={15} aria-hidden="true" /> {busy ? "Asking Gemini…" : "Check Gemini visibility"}</button>
    </form>
    {error && <p role="alert" className="data-insights-error">{error}</p>}
    {results && <div className="data-insights-result" role="status">
      <p><BadgeCheck size={15} aria-hidden="true" /> <strong>Mentioned in {mentioned} of {results.length} answers · cited as a source in {cited}.</strong></p>
      <ul className="gv-list">{results.map((r) => <li key={r.question}>
        <strong>{r.question}</strong>
        {r.error ? <span className="data-insights-error"> {r.error}</span> : <>
          <span className="gv-tags"><em className={r.mentioned ? "is-yes" : ""}>{r.mentioned ? "Mentioned" : "Not mentioned"}</em><em className={r.cited ? "is-yes" : ""}>{r.cited ? "Cited" : "Not cited"}</em></span>
          {r.snippet && <small>{r.snippet}{r.snippet.length >= 320 ? "…" : ""}</small>}
          {r.sources.length > 0 && <small>Sources Gemini used: {r.sources.join(", ")}</small>}
        </>}
      </li>)}</ul>
    </div>}
  </section>;
}
