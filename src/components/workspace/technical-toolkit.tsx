"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { RingScore } from "@/components/workspace/charts";
import { analyseLog, buildRobots, testRobots } from "@/lib/seo/toolbox";
import type * as server from "@/lib/seo/toolbox-server";

type Out<K extends keyof typeof server> = (typeof server)[K] extends (...args: never[]) => Promise<infer R> ? R : never;
const TOOLS = [
  ["rendering", "Server rendering", "Checks that your text and links are in the page before JavaScript runs. Leave the box empty to sample your sitemap, or list up to 24 pages."],
  ["sitemap", "Sitemap check", "Reads your sitemap, finds errors and compares it with your last crawl."],
  ["sitemap-generate", "Sitemap generator", "Builds an XML sitemap from the indexable pages in your last crawl."],
  ["robots", "robots.txt tester", "Load or edit robots.txt, test whether a crawler may open a page, or write a new file."],
  ["external-links", "Broken external links", "Checks up to 80 outgoing links found in your last crawl."],
  ["bulk", "Bulk URL checker", "Check the status of up to 50 addresses."],
  ["orphans", "Orphan pages", "Pages in your sitemap or Search Console that no crawled page links to."],
  ["duplicates", "Duplicate content", "Compares the text of up to 40 crawled pages with each other."],
  ["compare", "Compare crawls", "What changed between your last two site audits."],
  ["page", "Page checks", "Search preview, structured data, security headers and readability for one page."],
  ["images", "Image SEO", "Alt text, size, format, dimensions and lazy loading for one page."],
  ["logs", "Log file analysis", "See which search and AI bots visit. The file is read in your browser and never uploaded."],
  ["indexnow", "IndexNow", "Tell Bing and other IndexNow search engines about new or changed pages. Google does not use it."],
] as const;
type ToolId = (typeof TOOLS)[number][0];

function Table({ head, rows, empty = "Nothing found." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="gin-empty">{empty}</p>;
  return <div className="gin-scroll"><table className="gin-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
const mark = (ok: boolean, yes = "Pass", no = "Fix") => <em className={ok ? "is-up" : "is-down"}>{ok ? yes : no}</em>;
const when = (value: unknown) => new Date(String(value)).toLocaleDateString("en-IN", { dateStyle: "medium" });
function download(name: string, content: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" })); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
const cut = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function TechnicalToolkit({ domain, siteUrl }: { domain: string; siteUrl: string }) {
  const [tool, setTool] = useState<ToolId>("rendering");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tool: ToolId; data: unknown } | null>(null);
  const [url, setUrl] = useState(siteUrl);
  const [keyword, setKeyword] = useState("");
  const [list, setList] = useState("");
  const [robots, setRobots] = useState("User-agent: *\nDisallow:\n");
  const [agent, setAgent] = useState("Googlebot");
  const [path, setPath] = useState("/");
  const [blocked, setBlocked] = useState("");
  const [blockAi, setBlockAi] = useState(false);
  const [log, setLog] = useState<ReturnType<typeof analyseLog> | null>(null);
  const [key, setKey] = useState<{ key: string; fileUrl: string } | null>(null);
  const [note, setNote] = useState("");
  const current = TOOLS.find((item) => item[0] === tool)!;
  const lines = () => list.split(/\s+/).filter(Boolean);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNote("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/technical`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "The tool failed. Please try again."); return null; }
      return data;
    } catch { setError("Could not reach the server."); return null; }
    finally { setBusy(false); }
  }
  async function run() {
    setResult(null);
    const data = await post({ tool, url, keyword, urls: lines() });
    if (data) setResult({ tool, data });
  }
  async function readLog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setLog(null);
    if (file.size > 30 * 1024 * 1024) { setError("Choose a log file under 30 MB."); return; }
    setBusy(true);
    try { setLog(analyseLog(await file.text())); } catch { setError("That file could not be read."); } finally { setBusy(false); }
  }
  const button = (label: string, action: () => void) => <button type="button" disabled={busy} onClick={action}>{busy ? "Working…" : label}</button>;
  const data = result?.tool === tool ? result.data : null;

  return <section className="workspace-panel gin" aria-label="Technical SEO tools">
    <nav className="gin-tabs is-wrap" aria-label="Choose a tool">{TOOLS.map(([id, label]) => <button type="button" key={id} aria-pressed={tool === id} onClick={() => { setTool(id); setError(""); setNote(""); }}>{label}</button>)}</nav>
    <h3>{current[1]}</h3><p className="gin-empty">{current[2]}</p>

    {(tool === "page" || tool === "images") && <div className="gin-filters">
      <label className="is-long">Page address<input value={url} onChange={(e) => setUrl(e.target.value)} type="url" /></label>
      {tool === "page" && <label>Target keyword (optional)<input value={keyword} onChange={(e) => setKeyword(e.target.value)} /></label>}
    </div>}
    {(tool === "rendering" || tool === "bulk" || tool === "indexnow") && <textarea className="gin-area" rows={6} value={list} onChange={(e) => setList(e.target.value)} placeholder={`${siteUrl}/page-one\n${siteUrl}/page-two`} aria-label="Addresses, one per line" />}
    {!["robots", "logs", "indexnow"].includes(tool) && <div className="gin-filters">{button("Run", () => void run())}</div>}
    {error && <p role="alert" className="gin-error">{error}</p>}

    {tool === "robots" && <>
      <textarea className="gin-area" rows={9} value={robots} onChange={(e) => setRobots(e.target.value)} aria-label="robots.txt contents" />
      <div className="gin-filters">{button("Load my robots.txt", () => void post({ tool: "robots" }).then((d: Out<"robotsFile"> | null) => { if (d) { setRobots(d.text); setNote(d.problems.length ? d.problems.join(" ") : "Loaded. No syntax problems found."); } }))}
        <label>Crawler<select value={agent} onChange={(e) => setAgent(e.target.value)}>{["Googlebot", "Bingbot", "GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Page path<input value={path} onChange={(e) => setPath(e.target.value)} /></label></div>
      {(() => { const test = testRobots(robots, agent, path); return <p role="status">{mark(test.allowed, "Allowed", "Blocked")} {agent} → <code>{path}</code> {test.rule ? `by ${test.rule}` : "(no rule matches)"}</p>; })()}
      <h3>Write a new file</h3>
      <div className="gin-filters"><label className="is-long">Folders to block (space separated)<input value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="/admin /cart" /></label><label className="gin-check"><input type="checkbox" checked={blockAi} onChange={(e) => setBlockAi(e.target.checked)} /> Block AI training and answer crawlers</label>
        {button("Create", () => setRobots(buildRobots({ blocked: blocked.split(/\s+/), blockAi, sitemap: `${siteUrl.replace(/\/+$/, "")}/sitemap.xml` })))}{button("Download", () => download("robots.txt", robots))}</div>
    </>}

    {tool === "logs" && <><input type="file" accept=".log,.txt,text/plain" onChange={(e) => void readLog(e)} aria-label="Server access log" />
      {log && <><p className="gin-empty">{log.parsed.toLocaleString("en-IN")} of {log.lines.toLocaleString("en-IN")} lines understood. Bots are identified by their user-agent text, which can be faked.</p>
        <Table head={["Bot", "Visits", "Errors"]} rows={log.bots.map((b) => [b.name, b.hits, b.errors])} empty="No known bot found in this file." />
        <h3>Most crawled paths</h3><Table head={["Path", "Visits"]} rows={log.paths.map((p) => [p.key, p.count])} />
        <h3>Errors bots hit</h3><Table head={["Status and path", "Times"]} rows={log.errors.map((p) => [p.key, p.count])} empty="No errors." /></>}</>}

    {tool === "indexnow" && <>
      <p className="gin-empty">1. Create your key. 2. Upload a text file with that name to your website, containing only the key. 3. Enter changed addresses above and submit.</p>
      <div className="gin-filters">{button("Show my key", () => void post({ tool: "indexnow-key" }).then((d) => { if (d) setKey(d); }))}{button("Submit addresses", () => void post({ tool: "indexnow-submit", urls: lines() }).then((d) => { if (d) setNote(`${d.submitted} address(es) sent to IndexNow.`); }))}</div>
      {key && <p>Key: <code>{key.key}</code><br />File address: <code>{key.fileUrl}</code> {button("Download key file", () => download(`${key.key}.txt`, key.key))}</p>}
    </>}
    {note && <p role="status" className="gin-empty">{note}</p>}

    {data !== null && <Result tool={tool} data={data} />}
  </section>;
}

function Result({ tool, data }: { tool: ToolId; data: unknown }) {
  if (tool === "rendering") { const d = data as Out<"renderingReport">; const label = { missing: "Content missing", check: "Check by hand", ok: "Content present" }; return <div role="status">
    <p><strong>{d.missing ? `${d.missing} of ${d.checked} pages arrive without their content.` : `No empty pages among the ${d.checked} checked.`}</strong> Pages came from {d.source}.{d.checked < 2 ? " Only one page was checked, so this says little about inner pages." : ""}</p>
    {d.missing > 0 && <p className="gin-empty">Use server-side rendering or static generation so each address returns its own text, title and links. Google can run JavaScript, but it may take longer and can fail, and many other crawlers do not run it.</p>}
    {d.repeated.length > 0 && <><h3>Pages sharing one title</h3><Table head={["Title", "Pages"]} rows={d.repeated.map((r) => [r.title, r.count])} /></>}
    <Table head={["Page", "Result", "Words", "Internal links", "Title", "Main heading"]} rows={d.pages.map((p) => [p.url, <em key="v" className={p.verdict === "ok" ? "is-up" : "is-down"}>{label[p.verdict]}</em>, p.words, p.links, p.title || "—", p.h1 || "—"])} />
    {d.unreadable.length > 0 && <><h3>Could not be read</h3><Table head={["Page", "Status"]} rows={d.unreadable.map((u) => [u.url, u.status ?? "No answer"])} /></>}
  </div>; }
  if (tool === "sitemap") { const d = data as Out<"sitemapReport">; return <div role="status">
    <p><strong>{d.total}</strong> addresses in {d.files} file(s) at {d.sitemap}.{d.unreadable ? ` ${d.unreadable} file(s) could not be read.` : ""}</p>
    <Table head={["Check", "Found"]} rows={d.problems.map((p) => [p.title, p.count ? <em key="c" className="is-down">{p.count}</em> : mark(true, "None")])} />
    <h3>Status of {d.checked} sampled addresses</h3><Table head={["Address", "Result", "Status"]} rows={d.badUrls.map((b) => [b.url, b.state, b.status ?? "—"])} empty="Every sampled address works." />
    {d.hasCrawl ? <><h3>Indexable pages missing from the sitemap</h3><Table head={["Page"]} rows={d.missingFromSitemap.map((u) => [u])} empty="None." /><h3>In the sitemap but not reached by the last crawl</h3><Table head={["Page"]} rows={d.notCrawled.map((u) => [u])} empty="None." /></> : <p className="gin-empty">Run a site audit to compare the sitemap with your pages.</p>}
  </div>; }
  if (tool === "sitemap-generate") { const d = data as Out<"generateSitemap">; return <div role="status"><p><strong>{d.count}</strong> pages included. <button type="button" onClick={() => download("sitemap.xml", d.xml)}>Download sitemap.xml</button></p><pre className="gin-pre">{d.xml.slice(0, 3000)}{d.xml.length > 3000 ? "\n…" : ""}</pre></div>; }
  if (tool === "external-links") { const d = data as Out<"externalLinkReport">; return <div role="status"><p>{d.found} external links found, {d.checked} checked{d.notChecked ? `, ${d.notChecked} not checked` : ""}. “Blocked” means the other site refused an automated visit, so open it yourself.</p><Table head={["Link", "Result", "Status", "Found on"]} rows={d.problems.map((p) => [p.url, p.state, p.status ?? "—", p.on.join(", ")])} empty="Every checked link works." /></div>; }
  if (tool === "bulk") { const d = data as Out<"bulkReport">; return <div role="status">{d.skipped > 0 && <p>{d.skipped} address(es) were not checked in time.</p>}<Table head={["Address", "Result", "Status", "Ends at"]} rows={d.results.map((r) => [r.url, r.state, r.status ?? "—", r.finalUrl])} /></div>; }
  if (tool === "orphans") { const d = data as Out<"orphanReport">; return <div role="status"><p>Compared {d.sitemapUrls} sitemap and {d.searchUrls} Search Console addresses with {d.crawledPages} crawled pages. A small crawl limit can make pages look orphaned.</p><Table head={["Page", "Found in", "Crawled"]} rows={d.orphans.map((o) => [o.url, o.foundIn, o.crawled ? "Yes" : "No"])} empty="No orphan pages found." /></div>; }
  if (tool === "duplicates") { const d = data as Out<"duplicateReport">; return <div role="status"><p>{d.compared} pages with enough text were compared.</p><Table head={["Page", "Similar page", "Similarity"]} rows={d.pairs.map((p) => [p.a, p.b, `${p.similarity}%`])} empty="No heavily overlapping pages." /></div>; }
  if (tool === "compare") { const d = data as Out<"compareReport">; return <div role="status"><p>{when(d.previous.date)} (score {d.previous.score}) → {when(d.current.date)} (score {d.current.score}). {d.persisting} issue(s) remain.</p>
    <h3>New issues ({d.added.length})</h3><Table head={["Issue", "Page"]} rows={d.added.map((i) => [i.title, i.url])} /><h3>Fixed ({d.fixed.length})</h3><Table head={["Issue", "Page"]} rows={d.fixed.map((i) => [i.title, i.url])} />
    <h3>New pages</h3><Table head={["Page"]} rows={d.newPages.map((u) => [u])} empty="None." /><h3>Pages no longer crawled</h3><Table head={["Page"]} rows={d.missingPages.map((u) => [u])} empty="None." /></div>; }
  if (tool === "images") { const d = data as Out<"imageReport">; return <div role="status"><p>{d.total} images on the page, {d.checked} checked.</p><Table head={["Image", "Size", "To fix"]} rows={d.images.map((i) => [i.url, i.kilobytes === null ? "Unknown" : `${i.kilobytes} KB`, i.problems.join(", ") || mark(true, "Good")])} /></div>; }
  if (tool === "page") { const d = data as Out<"pageReport">; const r = d.readability; return <div role="status">
    <h3>Google result preview</h3><div className="gin-serp"><small>{d.url}</small><strong>{cut(d.meta.title || "(no title)", 60)}</strong><p>{cut(d.meta.description || "Google will pick text from the page because there is no description.", 158)}</p></div>
    <p className="gin-empty">Title {d.meta.title.length} characters, description {d.meta.description.length}. Google cuts by width and may rewrite either.</p>
    <h3>Social share preview</h3><div className="gin-serp"><strong>{d.meta.ogTitle || d.meta.title || "(no title)"}</strong><p>{d.meta.ogDescription || d.meta.description || "(no description)"}</p><small>{d.meta.ogImage ? `Image: ${d.meta.ogImage}` : "No share image (og:image) set."}</small></div>
    <h3>Structured data</h3><p className="gin-empty">{d.structured.blocks} block(s), {d.structured.invalid} broken. A basic check of common fields; confirm with Google’s Rich Results Test.</p><Table head={["Type", "Missing required", "Suggested"]} rows={d.structured.items.map((i) => [i.type, i.checked ? i.missing.join(", ") || mark(true, "None") : "Not checked", i.suggested.join(", ") || "—"])} empty="No structured data on this page." />
    <h3>Security headers</h3><div className="gin-score"><RingScore value={d.security.score} suffix="%" label="Security headers" /><span>{d.security.rows.filter((x) => x.ok).length} of {d.security.rows.length} in place</span></div><Table head={["Header", "Result", "How to fix"]} rows={d.security.rows.map((x) => [x.name, mark(x.ok), x.ok ? "—" : x.fix])} />
    <h3>Readability and keyword use</h3>{r ? <><Table head={["Measure", "Value"]} rows={[["Words", r.words], ["Reading ease (English, higher is easier)", r.readingEase], ["Average words per sentence", r.wordsPerSentence], ["Sentences over 25 words", r.longSentences], ...(r.keyword ? [["Keyword uses", r.keyword.uses], ["Keyword density", `${r.keyword.density}%`], ["In first 100 words", r.keyword.inFirst100 ? "Yes" : "No"], ["In page title", d.meta.title.toLowerCase().includes(d.keyword.toLowerCase()) ? "Yes" : "No"], ["In main heading", d.meta.h1.toLowerCase().includes(d.keyword.toLowerCase()) ? "Yes" : "No"]] : [])]} /><p className="gin-empty">Most used words: {r.topWords.map((w) => `${w.word} (${w.count})`).join(", ")}</p></> : <p className="gin-empty">No readable text found.</p>}
  </div>; }
  return null;
}
