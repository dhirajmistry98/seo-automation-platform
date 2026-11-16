"use client";

import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, CircleAlert, ExternalLink, HelpCircle, ListOrdered, LoaderCircle, RotateCcw, Search, Target, TrendingUp, XCircle } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; impact: "high" | "medium" | "low"; detail: string; fix: string };
type Result = {
  url: string; keyword: string; checkedAt: string; score: number; checks: Check[]; plan: Array<{ step: string; fix: string; impact: string }>;
  missingTopics: string[]; unansweredQuestions: string[]; relatedSearches: string[]; questions: string[]; wordCount: number; keywordCount: number;
  google: { connected: boolean; status?: GoogleStatus; message?: string; position: number | null; impressions: number; clicks: number; rankingPage: string | null; samePage: boolean | null };
  market: { language: string; country: string };
  topResults?: TopResults;
};
type Profile = { words: number; sections: number; keywordUses: number; keywordInTitle: boolean; keywordInH1: boolean; schema: string[] };
type TopResults =
  | { status: "ok"; position: number | null; rankingUrl: string | null; depth: number; checkedAt: string; comparedWith: string[]; top10: Array<{ rank: number; url: string; domain: string; title: string; yours: boolean }>;
      benchmark: { yours: Profile; top: { pages: number; words: number; sections: number; keywordUses: number; keywordInTitle: number; keywordInH1: number; schema: string[] }; missingTopics: string[] } }
  | { status: "not_your_site" | "unavailable" | "limit" | "error"; message: string };
type Target = { url: string; keyword: string; updatedAt: string; history: Array<{ at: string; score: number; position: number | null; serpPosition?: number | null; googleStatus?: GoogleStatus; googleMessage?: string }> };
type GoogleStatus = "ranking" | "not_ranking" | "not_connected" | "no_property" | "api_error" | "not_your_site";
const GOOGLE_LABEL: Record<GoogleStatus, string> = { ranking: "", not_ranking: "Not ranking yet", not_connected: "Connect Search Console", no_property: "No Search Console property", api_error: "Google error", not_your_site: "Not your website" };
/** Table cell text: the position, or why there is none (older checks without a status fall back to a dash). */
function googleCell(position: number | null | undefined, status?: GoogleStatus) { return position ? `#${Math.round(position)}` : status ? GOOGLE_LABEL[status] : "—"; }

const tone = (score: number) => (score >= 80 ? "is-good" : score >= 55 ? "is-fair" : "is-poor");
const statusIcon = { pass: CheckCircle2, warn: CircleAlert, fail: XCircle };

export function KeywordOptimizer({ websites }: { websites: Array<{ domain: string; url: string }> }) {
  const [url, setUrl] = useState(websites[0]?.url ?? "");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/keyword-optimizer", { cache: "no-store" })
      .then(async (response) => { const data = await readJson(response); if (active && response.ok) setTargets(data.targets || []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function run(targetUrl: string, targetKeyword: string) {
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/keyword-optimizer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: targetUrl, keyword: targetKeyword }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "The analysis failed.");
      setResult(data as Result);
      const list = await readJson(await fetch("/api/keyword-optimizer", { cache: "no-store" }));
      setTargets(list.targets || []);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The analysis failed."); } finally { setLoading(false); }
  }

  return (
    <div className="kw-opt">
      <form className="seo-check-form" onSubmit={(event) => { event.preventDefault(); void run(url, keyword); }}>
        <div className="kw-opt-fields">
          <label>Page you want to rank<input type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/services/seo" required maxLength={2048} /></label>
          <label>Keyword to rank for<input type="text" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. seo services in mumbai" required minLength={2} maxLength={100} /></label>
          <button type="submit" disabled={loading || !url.trim() || keyword.trim().length < 2}>{loading ? <><LoaderCircle size={14} className="site-spin" aria-hidden="true" /> Analyzing…</> : <><Target size={14} aria-hidden="true" /> Analyze</>}</button>
        </div>
        {websites.length > 0 && <div className="seo-check-sites"><span>Your websites:</span>{websites.map((site) => <button type="button" key={site.domain} onClick={() => setUrl(site.url)}>{site.domain}</button>)}</div>}
      </form>
      {error && <p className="workspace-alert" role="alert">{error}</p>}

      {result && (
        <div className="seo-check-result" aria-live="polite">
          <div className="seo-check-summary">
            <div className={`seo-check-score ${tone(result.score)}`}><strong>{result.score}</strong><small>On-page</small></div>
            <div className="seo-check-meta">
              <strong className="kw-opt-keyword">“{result.keyword}”</strong>
              <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
              <p>Checked live {new Date(result.checkedAt).toLocaleString()} · {result.wordCount.toLocaleString()} words · keyword used {result.keywordCount}× · market {result.market.country}/{result.market.language}</p>
            </div>
            <div className="kw-opt-google">
              <small>Google position</small>
              {result.google.position
                ? <><strong>#{Math.round(result.google.position)}</strong><span>{result.google.impressions} impressions · {result.google.clicks} clicks (28 days)</span></>
                : <><strong className="kw-opt-google-status">{result.google.status ? GOOGLE_LABEL[result.google.status] : result.google.connected ? "—" : "?"}</strong><span>{result.google.message || (result.google.connected ? "Not ranking yet in the last 28 days" : "Connect Search Console in Integrations to see real positions")}</span></>}
            </div>
          </div>
          {result.google.connected && result.google.samePage === false && result.google.rankingPage && <p className="google-data-message">Google currently ranks a different page for this keyword: <a href={result.google.rankingPage} target="_blank" rel="noreferrer">{result.google.rankingPage}</a>. Either optimize that page instead, or link from it to this one so the two pages do not compete.</p>}

          {result.topResults && <GoogleTopResults keyword={result.keyword} data={result.topResults} />}

          {result.plan.length > 0 && (
            <section className="seo-check-panel">
              <h3><ListOrdered size={15} aria-hidden="true" /> Your plan to rank higher</h3>
              <ol className="kw-opt-plan">{result.plan.map((item) => <li key={item.step}><span className={`kw-opt-impact is-${item.impact}`}>{item.impact} impact</span><strong>{item.step}</strong><p>{item.fix}</p></li>)}</ol>
            </section>
          )}

          {(result.missingTopics.length > 0 || result.unansweredQuestions.length > 0) && (
            <section className="seo-check-panel kw-opt-ideas">
              {result.missingTopics.length > 0 && <div><h3><Search size={15} aria-hidden="true" /> Related searches to cover</h3><p>People also search these on Google. Add a section for each one that fits your page.</p><ul>{result.missingTopics.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              {result.unansweredQuestions.length > 0 && <div><h3><HelpCircle size={15} aria-hidden="true" /> Questions to answer (FAQ)</h3><p>Answer each in 2–3 sentences under its own heading.</p><ul>{result.unansweredQuestions.map((item) => <li key={item}>{item}?</li>)}</ul></div>}
            </section>
          )}

          <section className="seo-check-panel">
            <h3><CheckCircle2 size={15} aria-hidden="true" /> All checks</h3>
            <ul className="kw-opt-checks">{result.checks.map((check) => { const Icon = statusIcon[check.status]; return <li key={check.id} className={`is-${check.status}`}><Icon size={14} aria-hidden="true" /><div><strong>{check.label}</strong><p>{check.detail}</p></div></li>; })}</ul>
          </section>
          <p className="seo-check-note">Ranking also depends on backlinks, site authority and competition, which an on-page check cannot measure. A high score means the page is ready to compete. Publish your changes, then re-run to track progress.</p>
        </div>
      )}

      {targets.length > 0 && (
        <section className="seo-check-panel">
          <h3><TrendingUp size={15} aria-hidden="true" /> Tracked keywords</h3>
          <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>Keyword</th><th>Page</th><th>Score</th><th>Google</th><th>Last check</th><th /></tr></thead><tbody>
            {targets.map((target) => { const last = target.history.at(-1); const first = target.history[0]; const change = last && first && target.history.length > 1 ? last.score - first.score : 0; return (
              <tr key={`${target.url}-${target.keyword}`}>
                <td>{target.keyword}</td>
                <td className="kw-opt-url">{target.url.replace(/^https?:\/\//, "")}</td>
                <td>{last?.score ?? "—"}{change ? <small className={change > 0 ? "kw-opt-up" : "kw-opt-down"}> {change > 0 ? "+" : ""}{change}</small> : null}</td>
                <td title={last?.googleMessage}>{last?.position ? googleCell(last.position, last.googleStatus) : last?.serpPosition ? `#${last.serpPosition}` : googleCell(last?.position, last?.googleStatus)}</td>
                <td>{new Date(target.updatedAt).toLocaleDateString()}</td>
                <td><button type="button" className="kw-opt-rerun" disabled={loading} onClick={() => { setUrl(target.url); setKeyword(target.keyword); void run(target.url, target.keyword); }}><RotateCcw size={12} aria-hidden="true" /> Re-check</button></td>
              </tr>
            ); })}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}

/** Live Google top 10 for the keyword and how the page compares with the top-ranking pages. */
function GoogleTopResults({ keyword, data }: { keyword: string; data: TopResults }) {
  if (data.status !== "ok") return <section className="seo-check-panel kw-serp"><h3><BarChart3 size={15} aria-hidden="true" /> Google&apos;s top results</h3><p className="kw-serp-note">{data.message}</p></section>;
  const { benchmark: b } = data;
  const row = (label: string, yours: string, top: string, behind: boolean) => <tr key={label}><td>{label}</td><td className={behind ? "kw-serp-behind" : ""}>{yours}</td><td>{top}</td></tr>;
  return <section className="seo-check-panel kw-serp">
    <h3><BarChart3 size={15} aria-hidden="true" /> Google&apos;s top results for “{keyword}”</h3>
    <div className="kw-serp-position">
      <strong>{data.position ? `#${data.position}` : `Not in the top ${data.depth}`}</strong>
      <span>{data.position ? <>Your site ranks here in live Google results{data.rankingUrl ? <> with <a href={data.rankingUrl} target="_blank" rel="noreferrer">{data.rankingUrl.replace(/^https?:\/\//, "")}</a></> : null}.</> : "Your site does not appear in the first results yet. Use the gaps below to compete."}</span>
      <small>Checked {new Date(data.checkedAt).toLocaleString()}; refreshed at most once a day.</small>
    </div>
    <ol className="kw-serp-list">{data.top10.map((item) => <li key={`${item.rank}-${item.url}`} className={item.yours ? "is-yours" : ""}><span className="kw-serp-rank">{item.rank}</span><span><a href={item.url} target="_blank" rel="noreferrer">{item.title || item.domain} <ExternalLink size={11} aria-hidden="true" /></a><small>{item.domain}{item.yours ? " · your site" : ""}</small></span></li>)}</ol>
    {b.top.pages > 0 && <>
      <h4>Your page vs the top {b.top.pages} pages</h4>
      <div className="google-report-table-wrap"><table className="google-report-table kw-serp-table"><thead><tr><th>Signal</th><th>Your page</th><th>Top pages</th></tr></thead><tbody>
        {row("Words", b.yours.words.toLocaleString(), `~${b.top.words.toLocaleString()}`, b.yours.words < b.top.words * 0.7)}
        {row("Sections (H2)", String(b.yours.sections), `~${b.top.sections}`, b.yours.sections < Math.round(b.top.sections * 0.6))}
        {row("Keyword uses", String(b.yours.keywordUses), `~${b.top.keywordUses}`, b.yours.keywordUses < Math.max(1, Math.round(b.top.keywordUses * 0.5)))}
        {row("Keyword in title", b.yours.keywordInTitle ? "Yes" : "No", `${b.top.keywordInTitle} of ${b.top.pages}`, !b.yours.keywordInTitle && b.top.keywordInTitle >= Math.ceil(b.top.pages / 2))}
        {row("Keyword in H1", b.yours.keywordInH1 ? "Yes" : "No", `${b.top.keywordInH1} of ${b.top.pages}`, !b.yours.keywordInH1 && b.top.keywordInH1 >= Math.ceil(b.top.pages / 2))}
        {row("Structured data", b.yours.schema.join(", ") || "None", b.top.schema.join(", ") || "—", b.top.schema.some((type) => !b.yours.schema.includes(type)))}
      </tbody></table></div>
      {b.missingTopics.length > 0 && <div className="kw-serp-topics"><h4>Topics the top pages cover that you don&apos;t</h4><div>{b.missingTopics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>}
    </>}
    {b.top.pages === 0 && <p className="kw-serp-note">The top pages could not be read for comparison (they may block automated visits).</p>}
  </section>;
}
