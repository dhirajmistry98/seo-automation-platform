"use client";

import { useState } from "react";
import { Info, LoaderCircle, Search, SlidersHorizontal } from "lucide-react";
import { SeoLocationSelector } from "@/components/workspace/seo-location-selector";
import type { SeoTarget } from "@/lib/seo/target";
import { readJson } from "@/lib/read-json";
import { ExportButton, ExtendedResults } from "@/components/workspace/research-extended-results";

/** Free research only: Google autocomplete plus the website's own Search Console data. */
type Kind = "keywords" | "questions" | "quick_wins" | "rank" | "cannibalization";
const REPORT_GROUPS: Array<{ label: string; kinds: Array<[Kind, string]> }> = [
  { label: "Keyword research", kinds: [["keywords", "Keyword ideas"], ["questions", "AEO question keywords"]] },
  { label: "Your Search Console data", kinds: [["quick_wins", "Quick wins (keywords near top 10)"], ["rank", "Keyword positions"], ["cannibalization", "Keyword cannibalization"]] },
];
const REPORT_LABEL = Object.fromEntries(REPORT_GROUPS.flatMap((group) => group.kinds)) as Record<Kind, string>;
/** Reports that do not need a verified website. */
const UNVERIFIED_KINDS: Kind[] = ["keywords", "questions", "cannibalization", "quick_wins"];
const SC_KINDS: Kind[] = ["quick_wins", "rank", "cannibalization"];
function keywordLimit(kind: Kind) { return kind === "keywords" ? 25 : kind === "rank" ? 10 : 1; }
function usesKeywords(kind: Kind) { return kind === "keywords" || kind === "questions" || kind === "rank"; }

type Report = { _id?: string; kind: Kind; query: string; locationName?: string; countryCode?: string; countryName?: string; languageCode: string; device?: "desktop" | "mobile"; searchConsoleConnected?: boolean; source?: string; fetchedAt: string; provider?: string; result: Array<Record<string, unknown>> };
export type ResearchHistoryReport = Report;
type Props = { domain: string; verified: boolean; initialHistory: Report[]; initialTarget: SeoTarget };
function value(item: Record<string, unknown>, ...keys: string[]) { for (const key of keys) { const v = item[key]; if (v !== undefined && v !== null && typeof v !== "object") return String(v); } return "—"; }
function reportLocation(report: Report) { return SC_KINDS.includes(report.kind) ? "Search Console" : [report.countryName || report.countryCode, report.languageCode].filter(Boolean).join(" · "); }

export function ResearchWorkbench({ domain, verified, initialHistory, initialTarget }: Props) {
  const [kind, setKind] = useState<Kind>("keywords");
  const [keywords, setKeywords] = useState("");
  const [target, setTarget] = useState(initialTarget);
  const [history, setHistory] = useState(initialHistory);
  const [active, setActive] = useState<Report | null>(initialHistory[0] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const keyList = keywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setLoading(true);
    try {
      if (usesKeywords(kind) && keyList.length > keywordLimit(kind)) throw new Error(keywordLimit(kind) === 1 ? "This report takes one keyword or topic phrase." : `This report supports up to ${keywordLimit(kind)} keywords at a time.`);
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, keywords: keyList, countryCode: target.countryCode, countryName: target.countryName, languageCode: target.languageCode }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Research request failed.");
      const report = payload.report as Report;
      setActive(report); setHistory((current) => [report, ...current].slice(0, 20)); setNotice(payload.requestNotice || "Report saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not run the report."); }
    finally { setLoading(false); }
  }

  return <div className="research-layout">
    <section className="research-panel"><div className="research-panel-heading"><span className="research-icon"><SlidersHorizontal size={17} /></span><div><p className="workspace-eyebrow">NEW REPORT</p><h2>Configure research</h2></div></div>
      <div className="research-config-alert"><strong>Free · real data</strong><p>{SC_KINDS.includes(kind) ? "Uses your own Google Search Console data. Connect Search Console for this website under Integrations." : "Ideas come from Google autocomplete, plus your Search Console clicks and positions when connected."}</p></div>
      {!verified && !UNVERIFIED_KINDS.includes(kind) && <div className="research-config-alert"><strong>Website verification required</strong><p>Verify ownership on the Websites page first. Keyword ideas, questions, quick wins and cannibalization work without verification.</p></div>}
      <form className="research-form" onSubmit={run}>
        <label>Report type<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>{REPORT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.kinds.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</optgroup>)}</select></label>
        {usesKeywords(kind) && <label>{kind === "questions" ? "Topic phrase" : keywordLimit(kind) === 1 ? "Keyword" : "Keywords"}<textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={kind === "rank" ? "One keyword per line (up to 10)" : kind === "questions" ? "For example: home solar installation" : "One keyword per line (up to 25)"} rows={keywordLimit(kind) === 1 ? 2 : 5} required /></label>}
        {(kind === "keywords" || kind === "questions") && <SeoLocationSelector value={target} onChange={setTarget} label="Country and language" />}
        <div className="research-info">
          <p><Info size={14} aria-hidden="true" /> All reports here are free. Search volume, difficulty, backlinks and competitor data need a paid data source and are not included.</p>
        </div>
        {error && <p className="research-error" role="alert">{error}</p>}{notice && <p className="research-success" role="status">{notice}</p>}
        <div className="research-submit-row">
          <button className="research-submit" type="submit" disabled={loading || (!verified && !UNVERIFIED_KINDS.includes(kind)) || (usesKeywords(kind) && !keyList.length)}>{loading ? <><LoaderCircle size={16} className="research-spinner" /> Running report…</> : <><Search size={16} /> Run report</>}</button>
        </div>
      </form>
    </section>
    <section className="research-results"><div className="research-results-heading"><div><p className="workspace-eyebrow">RESULTS</p><h2>{active ? REPORT_LABEL[active.kind] || "Report" : "Your research results"}</h2><p suppressHydrationWarning>{active ? `${active.query} · ${reportLocation(active)} · ${new Date(active.fetchedAt).toLocaleString()}` : "Run a report to see live data."}</p></div>{active && <ExportButton rows={active.result} name={`${domain}-${active.kind}-${active.fetchedAt.slice(0, 10)}`} />}</div>
      {active ? <ResultTable report={active} /> : <div className="research-empty"><span><Search size={22} /></span><strong>No report selected</strong><p>Results are saved for this website and available to your workspace members.</p></div>}
      <div className="research-history"><h3>Recent reports</h3>{history.length ? history.map((report, index) => <button type="button" key={report._id || `${report.kind}-${report.fetchedAt}-${index}`} onClick={() => setActive(report)} className={active === report ? "is-selected" : ""}><span>{REPORT_LABEL[report.kind] || report.kind}</span><small>{report.source === "scheduled" ? "Scheduled tracking · " : "Manual report · "}{reportLocation(report)} · {report.query || domain}</small><time suppressHydrationWarning>{new Date(report.fetchedAt).toLocaleDateString()}</time></button>) : <p>New reports will appear here.</p>}</div>
    </section>
  </div>;
}

function ResultTable({ report }: { report: Report }) {
  if (report.kind === "cannibalization") return <ExtendedResults report={report} />;
  if (report.kind === "quick_wins") {
    const total = report.result.length;
    return <div className="research-table-wrap">
      <table className="research-table">
        <thead><tr><th>Keyword</th><th title="Current average position in Google (90 days)">Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th title="Estimated extra monthly clicks if this keyword reaches #1">Potential clicks at #1</th><th>Ranking page</th></tr></thead>
        <tbody>{total ? report.result.map((item, index) => {
          const pos = Number(item.position);
          const posClass = pos <= 5 ? "research-change is-up" : pos <= 10 ? "" : "research-change is-down";
          const page = typeof item.page === "string" ? item.page : null;
          return <tr key={`${value(item, "keyword")}-${index}`}>
            <td><strong style={{ fontWeight: 600 }}>{value(item, "keyword")}</strong></td>
            <td><span className={posClass}># {value(item, "position")}</span></td>
            <td>{value(item, "impressions")}</td>
            <td>{value(item, "clicks")}</td>
            <td>{value(item, "ctr")}%</td>
            <td>{value(item, "potential_clicks")}</td>
            <td>{page ? <a href={page} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all", fontSize: "10px" }}>{page.replace(/^https?:\/\/(www\.)?[^/]+/, "") || "/"}</a> : "—"}</td>
          </tr>;
        }) : <tr><td colSpan={7}>No keywords found at positions 4–20 with 10+ impressions in the last 90 days. You may already be in the top 3 for most queries, or Search Console has not collected enough data yet.</td></tr>}
        </tbody>
      </table>
      <p className="research-data-note">Keywords are from your Google Search Console data for the last 90 days, filtered to positions 4–20 with at least 10 impressions and sorted by opportunity. &ldquo;Potential clicks at #1&rdquo; assumes a 28% click-through rate, an estimate and not a guarantee.</p>
    </div>;
  }
  if (report.kind === "keywords") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Keyword</th><th>Impressions</th><th>Clicks</th><th>Avg. position</th><th>Related searches</th></tr></thead><tbody>{report.result.length ? report.result.map((item, index) => {
      const gsc = item.gsc && typeof item.gsc === "object" ? item.gsc as Record<string, unknown> : null;
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions.filter((entry): entry is string => typeof entry === "string") : [];
      return <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{gsc ? value(gsc, "impressions") : "—"}</td><td>{gsc ? value(gsc, "clicks") : "—"}</td><td>{gsc && Number(gsc.impressions) > 0 ? value(gsc, "position") : "—"}</td><td>{suggestions.length ? suggestions.join(" · ") : "No suggestions returned"}</td></tr>;
    }) : <tr><td colSpan={5}>No results were returned.</td></tr>}</tbody></table><p className="research-data-note">Related searches come from Google autocomplete. {report.searchConsoleConnected ? "Impressions, clicks and positions are your Search Console data for the last 28 days." : "Connect Search Console to fill in your impressions, clicks and positions."}</p></div>;
  }
  if (report.kind === "questions") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Question people search</th><th>Type</th></tr></thead><tbody>{report.result.length ? report.result.map((item, index) => <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{value(item, "questionType")}</td></tr>) : <tr><td colSpan={2}>No question searches were found. Try a shorter, broader topic.</td></tr>}</tbody></table><p className="research-data-note">Questions come from Google autocomplete for the selected country and language. Use them as headings and FAQ answers on your pages.</p></div>;
  }
  return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Keyword</th><th>Avg. position</th><th>Page</th><th>Details</th></tr></thead><tbody>{report.result.length ? report.result.map((item, index) => <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{value(item, "rank_group")}</td><td>{value(item, "url") !== "—" ? <a href={value(item, "url")} target="_blank" rel="noreferrer">{value(item, "domain", "url")}</a> : "—"}</td><td>{value(item, "title")}</td></tr>) : <tr><td colSpan={4}>No results were returned.</td></tr>}</tbody></table><p className="research-data-note">Positions are impression-weighted averages from your Search Console data over the last 28 days, not a live search check.</p></div>;
}
