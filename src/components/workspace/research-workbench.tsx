"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, LoaderCircle, MapPinned, Search, ShieldCheck, Sparkles } from "lucide-react";
import { SeoLocationSelector } from "@/components/workspace/seo-location-selector";
import { ProviderAccountAlert, isBlockingIssue, providerActionLabel, type ProviderIssue } from "@/components/workspace/provider-account-alert";
import type { SeoTarget } from "@/lib/seo/target";
import { readJson } from "@/lib/read-json";

type Report = { _id?: string; kind: "keywords" | "questions" | "rank" | "backlinks" | "competitors" | "ai_visibility"; query: string; competitorDomain?: string; locationCode: number; locationName?: string; countryCode?: string; countryName?: string; countryLocationCode?: number; languageCode: string; device?: "desktop" | "mobile"; platform?: "google" | "chat_gpt"; source?: string; fetchedAt: string; provider?: string; searchConsoleConnected?: boolean; providerSummary?: Array<Record<string, unknown>>; result: Array<Record<string, unknown>> };
type Props = { domain: string; verified: boolean; configured: boolean; competitorDomains: string[]; initialHistory: Report[]; initialTarget: SeoTarget };
function value(item: Record<string, unknown>, ...keys: string[]) { for (const key of keys) { const v = item[key]; if (v !== undefined && v !== null && typeof v !== "object") return String(v); } return "—"; }
function nested(item: Record<string, unknown>, parent: string, key: string) { const object = item[parent]; return object && typeof object === "object" ? value(object as Record<string, unknown>, key) : "—"; }
function reportLocation(report: Report) { return report.kind === "backlinks" ? "Global backlink index" : report.kind === "rank" ? report.locationName || report.countryName || "Saved search area" : report.countryName || report.countryCode || "Country not recorded"; }

export function ResearchWorkbench({ domain, verified, configured, competitorDomains, initialHistory, initialTarget }: Props) {
  const [kind, setKind] = useState<Report["kind"]>("keywords");
  const [keywords, setKeywords] = useState("");
  const [target, setTarget] = useState(initialTarget);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [platform, setPlatform] = useState<"google" | "chat_gpt">("google");
  const [competitorDomain, setCompetitorDomain] = useState(competitorDomains[0] || "");
  const [history, setHistory] = useState(initialHistory);
  const [active, setActive] = useState<Report | null>(initialHistory[0] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerIssue, setProviderIssue] = useState<ProviderIssue | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(false);
  const blocked = isBlockingIssue(providerIssue);

  /** Server's view of the DataForSEO account (a free check, no report charge). */
  const fetchProviderStatus = useCallback(async (fresh: boolean) => {
    const response = await fetch(`/api/seo/provider-status${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
    if (!response.ok) return null;
    const status = await readJson(response) as { state: string; message?: string; actionUrl: string };
    return status.state === "ready" || status.state === "not_configured"
      ? null
      : { state: status.state as ProviderIssue["state"], message: status.message, actionUrl: status.actionUrl };
  }, []);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    fetchProviderStatus(false).then((issue) => { if (active) setProviderIssue(issue); }).catch(() => undefined);
    return () => { active = false; };
  }, [configured, fetchProviderStatus]);

  async function recheckProvider() {
    setCheckingProvider(true);
    try {
      const issue = await fetchProviderStatus(true);
      setProviderIssue(issue);
      if (!issue) { setError(""); setNotice("DataForSEO account is ready. You can run reports now."); }
    } catch { /* Keep the current state; running a report reports problems anyway. */ }
    finally { setCheckingProvider(false); }
  }

  const keyList = keywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setLoading(true);
    try {
      if ((kind === "keywords" || kind === "rank") && keyList.length > (kind === "rank" ? 10 : 25)) throw new Error(`This report supports up to ${kind === "rank" ? 10 : 25} keywords at a time.`);
      if (kind === "questions" && keyList.length !== 1) throw new Error("Question research supports one topic phrase per request.");
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, keywords: keyList, latitude: target.latitude, longitude: target.longitude, radiusKm: target.radiusKm, locationCode: target.locationCode, locationName: target.locationName, countryCode: target.countryCode, countryName: target.countryName, countryLocationCode: target.countryLocationCode, languageCode: target.languageCode, ...(kind === "rank" ? { device } : {}), ...(kind === "competitors" ? { competitorDomain } : {}), ...(kind === "ai_visibility" ? { platform } : {}) }) });
      const payload = await readJson(response);
      if (!response.ok) {
        if (payload.providerIssue) { setProviderIssue({ ...payload.providerIssue, message: payload.error }); return; }
        throw new Error(payload.error || "Research request failed.");
      }
      const report = payload.report as Report;
      setActive(report); setHistory((current) => [report, ...current].slice(0, 20)); setNotice(payload.requestNotice || "Report saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not run the report."); }
    finally { setLoading(false); }
  }
  return <div className="research-layout">
    <section className="research-panel"><div className="research-panel-heading"><span className="research-icon"><Sparkles size={17} /></span><div><p className="workspace-eyebrow">NEW REPORT</p><h2>Configure research</h2></div></div>
      {!configured && (kind === "keywords" || kind === "questions" || kind === "rank" ? <div className="research-config-alert"><strong>Free mode</strong><p>{kind === "rank" ? "Positions come from your Google Search Console data (connect it under Integrations)." : "Ideas come from Google autocomplete, plus your Search Console clicks and positions when connected."} No paid account needed.</p></div> : <div className="research-config-alert"><strong>Paid data source required</strong><p>Backlinks, competitor gaps and AI mentions need a DataForSEO account. Keyword demand, AEO questions and positions work for free.</p></div>)}
      {!verified && kind !== "keywords" && kind !== "questions" && <div className="research-config-alert"><strong>Website verification required</strong><p>This report looks up data for your domain. Verify ownership on the Websites page first. Keyword demand and AEO questions work without verification.</p></div>}
      {providerIssue && <ProviderAccountAlert issue={providerIssue} checking={checkingProvider} onRecheck={() => void recheckProvider()} />}
      <form className="research-form" onSubmit={run}>
        <label>Report type<select value={kind} onChange={(event) => setKind(event.target.value as Report["kind"])}><option value="keywords">Keyword demand</option><option value="questions">AEO question keywords</option><option value="rank">Live organic positions</option><option value="backlinks">Backlink summary</option><option value="competitors">Competitor keyword gaps</option><option value="ai_visibility">AI search mentions</option></select></label>
        {kind === "ai_visibility" && <label>AI search source<select value={platform} onChange={(event) => setPlatform(event.target.value as "google" | "chat_gpt")}><option value="google">Google AI Overviews</option><option value="chat_gpt">ChatGPT</option></select><small>Provider coverage varies by country. ChatGPT data is currently available only for United States English.</small></label>}
        {kind === "competitors" && (competitorDomains.length
          ? <label>Competitor domain<select value={competitorDomain} onChange={(event) => setCompetitorDomain(event.target.value)}>{competitorDomains.map((competitor) => <option key={competitor} value={competitor}>{competitor}</option>)}</select></label>
          : <div className="research-config-alert"><strong>No competitors configured</strong><p>Add competitor domains in this website’s settings before running a report.</p></div>)}
        {(kind === "keywords" || kind === "questions" || kind === "rank") && <label>{kind === "questions" ? "Topic phrase" : "Keywords"}<textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={kind === "rank" ? "One keyword per line (up to 10)" : kind === "questions" ? "For example: home solar installation" : "One keyword per line (up to 25)"} rows={kind === "questions" ? 2 : 5} required /></label>}
        {kind === "rank" && <label>Search device<select value={device} onChange={(event) => setDevice(event.target.value as "desktop" | "mobile")}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>}
        <SeoLocationSelector value={target} onChange={setTarget} label="City, region, or local area" />
        <div className="research-info">
          <p><MapPinned size={14} aria-hidden="true" /> City, region and live-location targeting applies to live Google position checks. Keyword demand, competitors and AI visibility use country-level data.</p>
          <p><Activity size={14} aria-hidden="true" /> Each run uses DataForSEO credit. AI mention results are sampled observations, not a promise of future citations.</p>
        </div>
        {error && <p className="research-error" role="alert">{error}</p>}{notice && <p className="research-success" role="status">{notice}</p>}
        <div className={`research-submit-row${blocked ? " is-blocked" : ""}`}>
          {blocked && providerIssue && <a className="research-verify-button" href={providerIssue.actionUrl} target="_blank" rel="noreferrer"><ShieldCheck size={16} aria-hidden="true" /> {providerActionLabel(providerIssue)} <ArrowUpRight size={14} aria-hidden="true" /></a>}
          <button className="research-submit" type="submit" disabled={loading || (blocked && kind !== "keywords" && kind !== "questions" && kind !== "rank") || (!configured && kind !== "keywords" && kind !== "questions" && kind !== "rank") || (!verified && kind !== "keywords" && kind !== "questions") || ((kind === "keywords" || kind === "questions" || kind === "rank") && !keyList.length) || (kind === "competitors" && !competitorDomain)}>{loading ? <><LoaderCircle size={16} className="research-spinner" /> Running report…</> : <><Search size={16} /> Run report</>}</button>
        </div>
      </form>
    </section>
    <section className="research-results"><div className="research-results-heading"><div><p className="workspace-eyebrow">PROVIDER RESULTS</p><h2>{active ? (active.kind === "keywords" ? "Keyword demand" : active.kind === "questions" ? "AEO question keywords" : active.kind === "rank" ? `${active.device === "mobile" ? "Mobile" : "Desktop"} organic positions` : active.kind === "competitors" ? "Competitor keyword gaps" : active.kind === "ai_visibility" ? "AI search mentions" : "Backlink summary") : "Your research results"}</h2><p>{active ? `${active.query} · ${reportLocation(active)} · ${new Date(active.fetchedAt).toLocaleString()}` : "Run a report to see live third-party data."}</p></div></div>
      {active ? <ResultTable report={active} domain={domain} /> : <div className="research-empty"><span><Search size={22} /></span><strong>No report selected</strong><p>Results are saved for this website and available to your workspace members.</p></div>}
      <div className="research-history"><h3>Recent reports</h3>{history.length ? history.map((report, index) => <button type="button" key={report._id || `${report.kind}-${report.fetchedAt}-${index}`} onClick={() => setActive(report)} className={active === report ? "is-selected" : ""}><span>{report.kind === "keywords" ? "Keyword demand" : report.kind === "questions" ? "AEO questions" : report.kind === "rank" ? `${report.device === "mobile" ? "Mobile" : "Desktop"} positions` : report.kind === "competitors" ? "Competitor gaps" : report.kind === "ai_visibility" ? "AI search mentions" : "Backlink summary"}</span><small>{report.source === "scheduled" ? "Scheduled tracking · " : "Manual report · "}{reportLocation(report)} · {report.query || domain}</small><time>{new Date(report.fetchedAt).toLocaleDateString()}</time></button>) : <p>New reports will appear here.</p>}</div>
    </section>
  </div>;
}

function nestedPath(item: Record<string, unknown>, ...keys: string[]) {
  let current: unknown = item;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "—";
    current = (current as Record<string, unknown>)[key];
  }
  return current === undefined || current === null || typeof current === "object" ? "—" : String(current);
}

function ResultTable({ report, domain }: { report: Report; domain: string }) {
  if (report.provider === "Google Autocomplete + Search Console" && report.kind === "keywords") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Keyword</th><th>Impressions</th><th>Clicks</th><th>Avg. position</th><th>Related searches</th></tr></thead><tbody>{report.result.length ? report.result.map((item, index) => {
      const gsc = item.gsc && typeof item.gsc === "object" ? item.gsc as Record<string, unknown> : null;
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions.filter((entry): entry is string => typeof entry === "string") : [];
      return <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{gsc ? value(gsc, "impressions") : "—"}</td><td>{gsc ? value(gsc, "clicks") : "—"}</td><td>{gsc && Number(gsc.impressions) > 0 ? value(gsc, "position") : "—"}</td><td>{suggestions.length ? suggestions.join(" · ") : "No suggestions returned"}</td></tr>;
    }) : <tr><td colSpan={5}>No results were returned.</td></tr>}</tbody></table><p className="research-data-note">Related searches come from Google autocomplete. {report.searchConsoleConnected ? "Impressions, clicks and positions are your Search Console data for the last 28 days." : "Connect Search Console to fill in your impressions, clicks and positions."} Search volume needs a paid data source.</p></div>;
  }
  if (report.provider === "Google Autocomplete + Search Console" && report.kind === "questions") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Question people search</th><th>Type</th></tr></thead><tbody>{report.result.length ? report.result.map((item, index) => <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{value(item, "questionType")}</td></tr>) : <tr><td colSpan={2}>No question searches were found. Try a shorter, broader topic.</td></tr>}</tbody></table><p className="research-data-note">Questions come from Google autocomplete for the selected country and language. Use them as headings and FAQ answers on your pages.</p></div>;
  }
  if (report.kind === "questions") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Question query</th><th>Search volume</th><th>Keyword difficulty</th><th>SERP features</th></tr></thead><tbody>{report.result.length ? report.result.slice(0, 100).map((item, index) => {
      const serp = item.serp_info && typeof item.serp_info === "object" ? item.serp_info as Record<string, unknown> : {};
      const types = Array.isArray(serp.serp_item_types) ? serp.serp_item_types.slice(0, 5).join(", ") : "—";
      return <tr key={`${value(item, "keyword")}-${index}`}><td>{value(item, "keyword")}</td><td>{nested(item, "keyword_info", "search_volume")}</td><td>{nested(item, "keyword_info", "keyword_difficulty")}</td><td>{types}</td></tr>;
    }) : <tr><td colSpan={4}>No question-form keyword suggestions were returned for this topic.</td></tr>}</tbody></table><p className="research-data-note">Question-form suggestions are a useful AEO research input only. They do not verify a searcher&apos;s intent or guarantee an answer placement.</p></div>;
  }
  if (report.kind === "ai_visibility") {
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Question</th><th>Platform</th><th>AI search volume</th><th>Sources citing this domain</th></tr></thead><tbody>{report.result.length ? report.result.slice(0, 100).map((item, index) => {
      const sources = Array.isArray(item.sources) ? item.sources as Array<Record<string, unknown>> : [];
      const matching = sources.filter((source) => typeof source.domain === "string" && (source.domain === domain || source.domain.endsWith(`.${domain}`)));
      return <tr key={`${value(item, "question")}-${index}`}><td><details><summary>{value(item, "question")}</summary><p>{value(item, "answer")}</p></details></td><td>{value(item, "model_name", "platform")}</td><td>{value(item, "ai_search_volume")}</td><td>{matching.length ? matching.slice(0, 5).map((source, sourceIndex) => { const href = externalHttpUrl(source.url); return <span key={sourceIndex}>{href ? <a href={href} target="_blank" rel="noreferrer">{value(source, "title", "domain")}</a> : value(source, "title", "domain")}{sourceIndex < matching.length - 1 ? ", " : ""}</span>; }) : "No matching source returned"}</td></tr>;
    }) : <tr><td colSpan={4}>The provider returned no AI mention records for this domain and region.</td></tr>}</tbody></table><p className="research-data-note">Data is supplied by DataForSEO for {report.platform === "chat_gpt" ? "ChatGPT" : "Google AI Overviews"}. The provider samples AI search answers and sources; coverage and timing can vary, and this does not establish a ranking or guarantee citations.</p></div>;
  }
  if (report.kind === "competitors") {
    const summaries = report.providerSummary || [];
    return <div className="research-table-wrap">{summaries.length > 0 && <div className="research-metric-grid">{summaries.map((summary, index) => <article key={String(summary.target || index)}><small>{value(summary, "target") || (index === 0 ? domain : report.competitorDomain || "Competitor")}</small><strong>{nestedPath(summary, "metrics", "organic", "etv")} estimated monthly visits</strong><span>{nestedPath(summary, "metrics", "organic", "count")} estimated ranking terms · {nestedPath(summary, "metrics", "organic", "pos_1")} at #1</span></article>)}</div>}<table className="research-table"><thead><tr><th>Keyword</th><th>Search volume</th><th>Your position</th><th>Your page</th></tr></thead><tbody>{report.result.length ? report.result.slice(0, 100).map((item, index) => <tr key={nestedPath(item, "keyword_data", "keyword") + "-" + index}><td>{nestedPath(item, "keyword_data", "keyword")}</td><td>{nestedPath(item, "keyword_data", "keyword_info", "search_volume")}</td><td>{nestedPath(item, "first_domain_serp_element", "rank_absolute")}</td><td>{nestedPath(item, "first_domain_serp_element", "url") !== "—" ? <a href={nestedPath(item, "first_domain_serp_element", "url")} target="_blank" rel="noreferrer">{nestedPath(item, "first_domain_serp_element", "domain")}</a> : "—"}</td></tr>) : <tr><td colSpan={4}>No uncovered keyword opportunities were returned.</td></tr>}</tbody></table><p className="research-data-note">Organic keyword gaps and domain traffic are third-party estimates for the selected location and language. This report is not first-party Search Console data.</p></div>;
  }
  if (report.kind === "backlinks") {
    const item = report.result[0] || {};
    const metrics = [["Backlinks", value(item, "backlinks")], ["Referring domains", value(item, "referring_domains")], ["Referring IPs", value(item, "referring_ips")], ["Domain rank", value(item, "rank", "domain_rank")]];
    return <div className="research-metric-grid">{metrics.map(([label, metric]) => <article key={label}><small>{label}</small><strong>{metric}</strong></article>)}<p>Provider metrics are estimates and may differ from Search Console or other vendors.</p></div>;
  }
  return <div className="research-table-wrap"><table className="research-table"><thead><tr>{report.kind === "keywords" ? <><th>Keyword</th><th>Search volume</th><th>Competition</th><th>CPC</th></> : <><th>Search query</th><th>Position</th><th>Page</th><th>Result title</th></>}</tr></thead><tbody>{report.result.length ? report.result.slice(0, 100).map((item, index) => <tr key={`${value(item, "keyword", "url")}-${index}`}>{report.kind === "keywords" ? <><td>{value(item, "keyword")}</td><td>{nested(item, "keyword_info", "search_volume")}</td><td>{nested(item, "keyword_info", "competition")}</td><td>{nested(item, "keyword_info", "cpc")}</td></> : <><td>{report.query.split(", ")[index] || value(item, "keyword")}</td><td>{value(item, "rank_group", "rank_absolute")}</td><td>{value(item, "url") !== "—" ? <a href={value(item, "url")} target="_blank" rel="noreferrer">{value(item, "domain", "url")}</a> : "—"}</td><td>{value(item, "title")}</td></>}</tr>) : <tr><td colSpan={4}>The provider returned no results for this request.</td></tr>}</tbody></table>{report.kind === "rank" && <p className="research-data-note">{report.device === "mobile" ? "Mobile" : "Desktop"} position rows reflect returned organic listings. Scheduled and manual results are stored separately by run time.</p>}</div>;
}

function externalHttpUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 2048) return null;
  try { const url = new URL(input); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
}
