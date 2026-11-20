"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Bot, CircleAlert, ExternalLink, LoaderCircle, Search, XCircle } from "lucide-react";
import { readJson } from "@/lib/read-json";

const PLATFORMS = [
  { id: "chat_gpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
] as const;
type Row = { prompt: string; platform: string; status: "ok" | "error"; model?: string | null; mentioned?: boolean; cited?: boolean; sentiment?: "positive" | "neutral" | "negative" | null; excerpt?: string; text?: string; sources?: Array<{ url: string; title: string }>; error?: string };
type Report = {
  brand: string; prompts: string[]; createdAt: string; providerCostUsd?: number; rows: Row[];
  summary: { answered: number; mentioned: number; cited: number; sentiment?: { positive: number; neutral: number; negative: number }; platforms: Array<{ platform: string; label: string; answered: number; failed: number; mentioned: number; cited: number }>; topCitedDomains: Array<{ domain: string; count: number }> };
};
const label = (platform: string) => PLATFORMS.find((item) => item.id === platform)?.label ?? platform;

/** Ask ChatGPT, Claude, Gemini and Perplexity customer questions and show whether the brand is mentioned or cited. */
export function AiAnswersPanel({ domain, canRun }: { domain: string; canRun: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [configured, setConfigured] = useState(true);
  const [verified, setVerified] = useState(true);
  const [brand, setBrand] = useState("");
  const [prompts, setPrompts] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.map((item) => item.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/ai-answers`, { cache: "no-store" }).then(async (response) => {
      const data = await readJson(response);
      if (!active || !response.ok) return;
      setReports(data.reports || []); setConfigured(Boolean(data.configured)); setVerified(Boolean(data.verified));
      setBrand((current) => current || data.reports?.[0]?.brand || data.defaultBrand || "");
      setPrompts((current) => current || (data.reports?.[0]?.prompts || []).join("\n"));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [domain]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const list = prompts.split("\n").map((item) => item.trim()).filter(Boolean);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/ai-answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompts: list, brand, platforms }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not check AI visibility for this keyword. Please try again.");
      setReports((current) => [data.report, ...current].slice(0, 5));
    } catch (error) { setMessage(error instanceof Error ? error.message : "The AI answer check failed."); }
    finally { setBusy(false); }
  }

  const latest = reports[0];
  const questionCount = prompts.split("\n").map((item) => item.trim()).filter(Boolean).length;
  return <section className="workspace-section ai-answers" id="ai-answers" aria-labelledby="ai-answers-title">
    <div className="ai-answers-head">
      <span className="ai-answers-icon"><Bot size={18} aria-hidden="true" /></span>
      <div><p className="workspace-eyebrow">LIVE AI ANSWERS</p><h2 id="ai-answers-title">Does AI recommend you?</h2>
        <p>Ask ChatGPT, Claude, Gemini and Perplexity the questions your customers ask. See whether they mention your brand, cite your website, and which sites they cite instead.</p></div>
    </div>

    {!verified && <p className="ai-answers-note"><CircleAlert size={14} aria-hidden="true" /> Verify ownership of {domain} to check AI answers.</p>}
    {verified && !configured && <p className="ai-answers-note"><CircleAlert size={14} aria-hidden="true" /> AI answer checks are not configured on this server yet.</p>}

    {canRun && verified && configured && <form className="ai-answers-form" onSubmit={run}>
      <label><span>Your brand or business name</span><input value={brand} onChange={(event) => setBrand(event.target.value)} required minLength={2} maxLength={80} placeholder="e.g. SEO Studio" /></label>
      <label><span>Questions customers ask (one per line, up to 5)</span><textarea value={prompts} onChange={(event) => setPrompts(event.target.value)} rows={4} required placeholder={"What is the best SEO tool for small businesses in India?\nWhich SEO agency in Mumbai is good for startups?"} /></label>
      <fieldset><legend>AI assistants</legend>{PLATFORMS.map((item) => <label key={item.id} className="ai-answers-check"><input type="checkbox" checked={platforms.includes(item.id)} onChange={(event) => setPlatforms((current) => event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id))} />{item.label}</label>)}</fieldset>
      <div className="ai-answers-actions">
        <button type="submit" disabled={busy || !platforms.length || questionCount < 1 || questionCount > 5}>{busy ? <><LoaderCircle size={14} className="site-spin" aria-hidden="true" /> Asking {platforms.length} AI assistants…</> : <><Search size={14} aria-hidden="true" /> Check AI answers</>}</button>
        <small>{questionCount > 5 ? "Use at most 5 questions." : `${questionCount * platforms.length} answers · usually 30–90 seconds · uses provider credits`}</small>
      </div>
    </form>}
    {message && <p className="google-data-message" role="status">{message}</p>}

    {latest && <div className="ai-answers-result">
      <div className="ai-answers-summary">
        <div><strong>{latest.summary.mentioned}/{latest.summary.answered}</strong><span>answers mention “{latest.brand}”</span></div>
        <div><strong>{latest.summary.cited}/{latest.summary.answered}</strong><span>answers cite {domain}</span></div>
        {latest.summary.sentiment && latest.summary.mentioned > 0 && <div><strong>{latest.summary.sentiment.positive} · {latest.summary.sentiment.neutral} · {latest.summary.sentiment.negative}</strong><span>positive · neutral · negative mentions (word-based estimate)</span></div>}
        <small>Checked {new Date(latest.createdAt).toLocaleString()}. AI answers vary between runs; re-check over time.</small>
      </div>
      <div className="ai-answers-platforms">{latest.summary.platforms.map((item) => <div key={item.platform}><strong>{item.label}</strong><span>Mentioned {item.mentioned}/{item.answered}</span><span>Cited {item.cited}/{item.answered}</span>{item.failed > 0 && <small>{item.failed} failed</small>}</div>)}</div>
      {latest.summary.topCitedDomains.length > 0 && <div className="ai-answers-domains"><h3>Sites these AI assistants cite</h3><div>{latest.summary.topCitedDomains.map((item) => <span key={item.domain} className={item.domain === domain || item.domain.endsWith(`.${domain}`) ? "is-yours" : ""}>{item.domain} · {item.count}</span>)}</div></div>}
      {latest.prompts.map((prompt) => <div key={prompt} className="ai-answers-prompt">
        <h3>“{prompt}”</h3>
        {latest.rows.filter((row) => row.prompt === prompt).map((row) => {
          const key = `${prompt}|${row.platform}`;
          return <article key={key} className={`ai-answers-row ${row.status === "error" ? "is-error" : row.mentioned ? "is-mentioned" : ""}`}>
            <header><strong>{label(row.platform)}</strong>{row.status === "ok" ? <span className="ai-answers-badges"><span className={row.mentioned ? "is-yes" : "is-no"}>{row.mentioned ? <BadgeCheck size={12} /> : <XCircle size={12} />} {row.mentioned ? "Mentioned" : "Not mentioned"}</span><span className={row.cited ? "is-yes" : "is-no"}>{row.cited ? <BadgeCheck size={12} /> : <XCircle size={12} />} {row.cited ? "Cited" : "Not cited"}</span>{row.mentioned && row.sentiment && <span className={row.sentiment === "positive" ? "is-yes" : row.sentiment === "negative" ? "is-no" : ""} title="Word-based estimate from the sentences that name your brand">{row.sentiment === "positive" ? "Positive" : row.sentiment === "negative" ? "Negative" : "Neutral"}</span>}</span> : <span className="ai-answers-error">{row.error}</span>}</header>
            {row.status === "ok" && <>
              <p>{row.excerpt}</p>
              <button type="button" className="ai-answers-toggle" onClick={() => setOpen(open === key ? null : key)}>{open === key ? "Hide full answer" : "Show full answer and sources"}</button>
              {open === key && <div className="ai-answers-full"><p>{row.text}</p>{!!row.sources?.length && <ul>{row.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url} <ExternalLink size={10} aria-hidden="true" /></a></li>)}</ul>}<small>{row.model}</small></div>}
            </>}
          </article>;
        })}
      </div>)}
    </div>}
  </section>;
}
