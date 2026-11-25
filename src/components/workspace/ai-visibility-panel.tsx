"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CircleAlert, ExternalLink, Radar } from "lucide-react";

type Engine = { id: string; label: string; provider: string; connected: boolean; setup: string };
type Source = { title: string; url: string };
type Result = { engine: string; question: string; answered: boolean; mentioned: boolean; cited: boolean; sources: Source[]; snippet: string; competitors: string[]; error?: string };
type Summary = { engine: string; label: string; asked: number; answered: number; mentioned: number; cited: number };
type Voice = { answered: number; rows: Array<{ host: string; mentions: number; percent: number; isYou: boolean }> };
type Run = { summary: Summary[]; results: Result[]; shareOfVoice: Voice; checkedAt: string };
type HistoryItem = { createdAt: string; summary: Summary[]; questionCount: number };

async function fetchSettings(domain: string) {
  try {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/ai-visibility`, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

export function AiVisibilityPanel({ domain }: { domain: string }) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [questions, setQuestions] = useState("");
  const [save, setSave] = useState(true);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(null);

  const apply = useCallback((data: { engines: Engine[]; prompts: string[]; competitors: string[]; history: HistoryItem[] } | null) => {
    if (!data) { setError("Could not load the AI visibility settings."); setLoading(false); return; }
    setEngines(data.engines);
    setSelected((current) => (current.length ? current : data.engines.filter((e) => e.connected).map((e) => e.id)));
    setQuestions((current) => current || data.prompts.join("\n"));
    setCompetitors(data.competitors);
    setHistory(data.history);
    setLoading(false);
  }, []);
  useEffect(() => {
    let alive = true;
    fetchSettings(domain).then((data) => { if (alive) apply(data); });
    return () => { alive = false; };
  }, [domain, apply]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setReasons([]); setRun(null);
    try {
      const list = questions.split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 5);
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/ai-visibility`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions: list, engines: selected, savePrompts: save && list.length > 0 }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "The check failed. Please try again."); setReasons(Array.isArray(data.reasons) ? data.reasons : []); }
      else { setRun(data); void fetchSettings(domain).then((fresh) => { if (fresh) apply(fresh); }); }
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const connected = engines.filter((engine) => engine.connected);
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const totals = run ? run.summary.reduce((acc, item) => ({ answered: acc.answered + item.answered, mentioned: acc.mentioned + item.mentioned, cited: acc.cited + item.cited }), { answered: 0, mentioned: 0, cited: 0 }) : null;

  return <section className="workspace-panel aiv" aria-label="AI search visibility">
    <p className="workspace-eyebrow"><span /> AI SEARCH VISIBILITY</p>
    <h2>Does AI mention or cite {domain}?</h2>
    <p>We ask each connected AI engine, with web search on, the questions your customers ask. Then we check whether your brand is mentioned, whether your website is listed as a source, and which competitors appear instead. Each result is a snapshot of one answer, not a ranking.</p>

    <ul className="aiv-engines" aria-label="AI engines">
      {loading ? <li className="aiv-engine">Loading engines…</li> : engines.map((engine) => <li key={engine.id} className={`aiv-engine${engine.connected ? " is-on" : ""}`}>
        <label title={engine.connected ? `Ask ${engine.label}` : engine.setup}>
          <input type="checkbox" disabled={!engine.connected} checked={selected.includes(engine.id)} onChange={() => toggle(engine.id)} />
          <strong>{engine.label}</strong>
          <small>{engine.connected ? "Connected" : "Not connected"}</small>
        </label>
      </li>)}
    </ul>
    {!loading && connected.length === 0 && <p className="aiv-note" role="status"><CircleAlert size={15} aria-hidden="true" /> No AI engine is connected yet. Each engine needs its own API key added to the server settings; you only need the ones you want. Hover an engine to see which key it uses.</p>}

    <form onSubmit={submit}>
      <textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={4} maxLength={1200} placeholder={"One question per line (up to 5), for example:\nWhat is the best SEO audit tool for small businesses?\nLeave empty to use your saved prompts or keywords."} aria-label="Questions to ask the AI engines" />
      <div className="aiv-actions">
        <label className="aiv-save"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save these as my tracked prompts</label>
        <button type="submit" disabled={busy || selected.length === 0}><Radar size={15} aria-hidden="true" /> {busy ? "Asking…" : `Check ${selected.length || ""} engine${selected.length === 1 ? "" : "s"}`}</button>
      </div>
    </form>
    {competitors.length > 0 && <p className="aiv-hint">Competitors compared: {competitors.join(", ")} (from your website settings).</p>}
    {error && <p role="alert" className="data-insights-error">{error}</p>}
    {reasons.length > 0 && <ul className="aiv-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}

    {run && totals && <div className="aiv-results" role="status">
      <p className="aiv-headline"><BadgeCheck size={16} aria-hidden="true" /> Mentioned in <strong>{totals.mentioned}</strong> of {totals.answered} answers · cited as a source in <strong>{totals.cited}</strong>.</p>
      <div className="aiv-grid">
        {run.summary.map((item) => <article key={item.engine} className="aiv-card">
          <h3>{item.label}</h3>
          <dl>
            <div><dt>Mentioned</dt><dd>{item.mentioned}/{item.answered}</dd><i style={{ width: `${pct(item.mentioned, item.answered)}%` }} /></div>
            <div><dt>Cited</dt><dd>{item.cited}/{item.answered}</dd><i style={{ width: `${pct(item.cited, item.answered)}%` }} /></div>
          </dl>
          {item.answered < item.asked && <small>{item.asked - item.answered} question{item.asked - item.answered === 1 ? "" : "s"} could not be answered.</small>}
        </article>)}
      </div>
      {run.shareOfVoice.rows.length > 0 && <div className="aiv-voice">
        <h3>Share of voice <small>({run.shareOfVoice.answered} answers checked)</small></h3>
        <ul>{run.shareOfVoice.rows.map((row) => <li key={row.host} className={row.isYou ? "is-you" : ""}><span>{row.host}{row.isYou ? " (you)" : ""}</span><div><i style={{ width: `${row.percent}%` }} /></div><b>{row.percent}%</b></li>)}</ul>
        <small>Counts how often each site is named in the answers above. It reflects this sample only.</small>
      </div>}
      <ul className="gv-list aiv-answers">{run.results.map((r) => <li key={`${r.engine}-${r.question}`}>
        <strong>{r.question}</strong>
        <span className="gv-tags"><em>{run.summary.find((s) => s.engine === r.engine)?.label ?? r.engine}</em>{r.answered ? <><em className={r.mentioned ? "is-yes" : ""}>{r.mentioned ? "Mentioned" : "Not mentioned"}</em><em className={r.cited ? "is-yes" : ""}>{r.cited ? "Cited" : "Not cited"}</em></> : <em>No answer</em>}</span>
        {r.error && <span className="data-insights-error"> {r.error}</span>}
        {r.snippet && <small>{r.snippet}{r.snippet.length >= 400 ? "…" : ""}</small>}
        {r.competitors.length > 0 && <small>Competitors named: {r.competitors.join(", ")}</small>}
        {r.sources.length > 0 && <small className="aiv-sources">Sources: {r.sources.slice(0, 5).map((source) => { const href = safeHref(source.url); return href ? <a key={source.url} href={href} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={11} aria-hidden="true" /></a> : <span key={source.url}>{source.title}</span>; })}</small>}
      </li>)}</ul>
    </div>}

    {history.length > 0 && <div className="aiv-history">
      <h3>History</h3>
      <div className="aiv-history-scroll"><table>
        <thead><tr><th>Checked</th><th>Engines</th><th>Mention rate</th><th>Citation rate</th></tr></thead>
        <tbody>{history.map((item) => { const totalsRow = item.summary.reduce((acc, s) => ({ answered: acc.answered + s.answered, mentioned: acc.mentioned + s.mentioned, cited: acc.cited + s.cited }), { answered: 0, mentioned: 0, cited: 0 }); return <tr key={String(item.createdAt)}>
          <td>{new Date(item.createdAt).toLocaleString()}</td>
          <td>{item.summary.map((s) => s.label).join(", ")}</td>
          <td>{pct(totalsRow.mentioned, totalsRow.answered)}% <small>({totalsRow.mentioned}/{totalsRow.answered})</small></td>
          <td>{pct(totalsRow.cited, totalsRow.answered)}% <small>({totalsRow.cited}/{totalsRow.answered})</small></td>
        </tr>; })}</tbody>
      </table></div>
    </div>}
  </section>;
}
