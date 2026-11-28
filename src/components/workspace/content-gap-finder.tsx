"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { findContentGaps, gapPrompt, readQueriesCsv } from "@/lib/seo/content-gap";
import type { PageRow, QueryRow } from "@/lib/seo/keyword-strategy";

type Props = { domain: string; brandTerms: string[]; pages: PageRow[] };
const n = (value: number) => value.toLocaleString("en-IN");

export function ContentGapFinder({ domain, brandTerms, pages }: Props) {
  const [rows, setRows] = useState<QueryRow[] | null>(null);
  const [minimum, setMinimum] = useState(10);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [prompt, setPrompt] = useState("");
  const result = rows ? findContentGaps(rows, pages, brandTerms, minimum) : null;

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRows(null); setError(""); setNote(""); setPrompt("");
    if (file.size > 5 * 1024 * 1024) { setError("Choose a CSV file under 5 MB."); return; }
    try {
      const parsed = readQueriesCsv(await file.text());
      if ("error" in parsed) setError(parsed.error); else setRows(parsed.rows);
    } catch { setError("That file could not be read."); }
  }
  async function copy() {
    const text = gapPrompt(domain, rows ?? [], pages);
    try { await navigator.clipboard.writeText(text); setNote("Prompt copied. Paste it into Claude or another AI assistant."); setPrompt(""); }
    catch { setNote("Copying was blocked. Select the text below and copy it."); setPrompt(text); }
  }
  const table = (list: NonNullable<typeof result>["missing"], empty: string) => list.length ? <div className="gin-scroll"><table className="gin-table"><thead><tr><th>Topic</th><th>Related searches</th><th>Intent</th><th>Impressions</th><th>Clicks</th><th>Position</th><th>Closest page</th></tr></thead><tbody>{list.map((item) => <tr key={item.topic}><td><strong>{item.topic}</strong></td><td>{item.queries.slice(1, 5).map((q) => q.query).join(", ") || "—"}</td><td>{item.intent}</td><td>{n(item.impressions)}</td><td>{n(item.clicks)}</td><td>{item.position}</td><td>{item.page ? <a href={/^https?:/.test(item.page.url) ? item.page.url : undefined} target="_blank" rel="noopener noreferrer">{item.page.url}</a> : "None found"}</td></tr>)}</tbody></table></div> : <p className="gin-empty">{empty}</p>;

  return <section className="workspace-panel gin" aria-label="Content gap finder">
    <h3>1. Export from Search Console</h3>
    <ol className="gin-steps"><li>Open <a href="https://search.google.com/search-console/performance/search-analytics" target="_blank" rel="noopener noreferrer">Performance → Search results</a> and choose the property for {domain}.</li><li>Set the date range to the last 12 months and turn on Average position.</li><li>Choose <strong>Export → Download CSV</strong>, unzip it, and pick <strong>Queries.csv</strong> below.</li></ol>
    <p className="gin-empty">Google limits this export to the top 1,000 queries and hides some rare ones.</p>
    <h3>2. Add the file</h3>
    {!pages.length ? <p className="gin-error" role="status">There are no crawled pages for {domain} yet, so every search would look like a gap. <Link href="/dashboard/tools/audit">Run a site audit</Link> first.</p> : <>
      <div className="gin-filters"><label className="is-long">Queries.csv (read in your browser, never uploaded)<input type="file" accept=".csv,text/csv" onChange={(e) => void read(e)} /></label>
        <label>Smallest topic<select value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>{[1, 10, 50, 100].map((v) => <option key={v} value={v}>{v}+ impressions</option>)}</select></label></div>
      <p className="gin-empty">Compared with {pages.length} crawled page(s).</p>
    </>}
    {error && <p role="alert" className="gin-error">{error}</p>}
    {result && <div role="status">
      <p>{n(result.considered)} searches checked{result.brandedSkipped ? `, ${n(result.brandedSkipped)} brand searches left out` : ""}.</p>
      <h3>No page found ({result.missing.length})</h3>{table(result.missing, "Every topic has a likely page.")}
      <h3>Page exists but ranks low ({result.weak.length})</h3>{table(result.weak, "No matched topic ranks below position 15.")}
      <p className="gin-empty">Pages are matched by words in the address, title and main heading, so check that a topic is really uncovered before writing.</p>
      <h3>3. Optional: get a second opinion from AI</h3>
      <p><button type="button" onClick={() => void copy()}>Copy AI prompt</button></p>
      <p className="gin-empty">It includes your page list and top 300 queries. Sharing it sends that data to the AI service you paste it into.</p>
      {note && <p className="gin-empty">{note}</p>}
      {prompt && <textarea className="gin-area" rows={10} readOnly value={prompt} aria-label="AI prompt" />}
    </div>}
  </section>;
}
