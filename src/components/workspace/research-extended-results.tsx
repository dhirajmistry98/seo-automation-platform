"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Sparkles } from "lucide-react";
import { reportCsv } from "@/lib/integrations/research-reports";

type Row = Record<string, unknown>;
export type ExtendedReport = { kind: string; query: string; competitorDomain?: string; backlinkMode?: string; providerSummary?: Row[]; result: Row[] };

function obj(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function n(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function fmt(value: unknown, digits = 0) { const number = n(value); return number === null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits }); }
function text(value: unknown) { return typeof value === "string" && value ? value : "—"; }
function date(value: unknown) { return typeof value === "string" && value ? value.slice(0, 10) : "—"; }
function safeHref(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}
function ExternalLink({ href, children }: { href: unknown; children: React.ReactNode }) { const safe = safeHref(href); return safe ? <a href={safe} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>; }
function shortUrl(value: unknown) { if (typeof value !== "string") return "—"; try { const url = new URL(value); return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } }

/** Keyword difficulty band, as Semrush shows it. */
export function difficultyLabel(value: unknown) {
  const kd = n(value);
  if (kd === null) return "—";
  const band = kd >= 85 ? "Very hard" : kd >= 70 ? "Hard" : kd >= 50 ? "Difficult" : kd >= 30 ? "Possible" : kd >= 15 ? "Easy" : "Very easy";
  return `${Math.round(kd)} · ${band}`;
}
export function intentLabel(value: unknown) { return typeof value === "string" && value ? value[0].toUpperCase() + value.slice(1) : "—"; }

function Trend({ values }: { values: unknown }) {
  const list = Array.isArray(values) ? values.map((value) => n(value) ?? 0) : [];
  if (list.length < 2) return <>—</>;
  const max = Math.max(...list, 1);
  return <span className="research-trend" aria-label={`Monthly searches: ${list.join(", ")}`}>{list.map((value, index) => <i key={index} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />)}</span>;
}

function PositionChange({ row }: { row: Row }) {
  if (row.is_new === true) return <span className="research-change is-new">New</span>;
  const now = n(row.absolute_position ?? row.position); const before = n(row.previous_position);
  if (now === null || before === null || now === before) return <>—</>;
  return now < before ? <span className="research-change is-up"><ArrowUp size={10} aria-hidden="true" />{before - now}</span> : <span className="research-change is-down"><ArrowDown size={10} aria-hidden="true" />{now - before}</span>;
}

export function ExportButton({ rows, name }: { rows: Row[]; name: string }) {
  if (!rows.length) return null;
  function download() {
    const blob = new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return <button type="button" className="research-export" onClick={download}><Download size={13} aria-hidden="true" /> Export CSV</button>;
}

function Empty({ columns, message }: { columns: number; message: string }) { return <tr><td colSpan={columns}>{message}</td></tr>; }

function DomainOverview({ report }: { report: ExtendedReport }) {
  const summary = report.providerSummary?.[0] || {};
  const organic = obj(summary.organic); const paid = obj(summary.paid); const backlinks = obj(summary.backlinks);
  const history = Array.isArray(summary.history) ? summary.history as Row[] : [];
  const maxEtv = Math.max(1, ...history.map((point) => n(point.organic_etv) ?? 0));
  const buckets = [["#1", organic.pos_1], ["2–3", organic.pos_2_3], ["4–10", organic.pos_4_10], ["11–20", organic.pos_11_20], ["21–50", organic.pos_21_50], ["51–100", organic.pos_51_100]] as const;
  const maxBucket = Math.max(1, ...buckets.map(([, value]) => n(value) ?? 0));
  return <div className="research-table-wrap">
    <div className="research-metric-grid is-four">
      <article><small>Organic traffic / month</small><strong>{fmt(organic.etv)}</strong><span>Estimated visits</span></article>
      <article><small>Organic keywords</small><strong>{fmt(organic.count)}</strong><span>{fmt(organic.is_new)} new · {fmt(organic.is_lost)} lost</span></article>
      <article><small>Paid traffic / month</small><strong>{fmt(paid.etv)}</strong><span>{fmt(paid.count)} paid keywords</span></article>
      <article><small>Backlinks</small><strong>{fmt(backlinks.backlinks)}</strong><span>{fmt(backlinks.referring_domains)} referring domains · rank {fmt(backlinks.rank)}</span></article>
    </div>
    <div className="research-overview-charts">
      <section><h3>Organic traffic trend</h3>{history.length ? <div className="research-bars" role="img" aria-label="Estimated organic traffic per month">{history.map((point) => <span key={`${point.year}-${point.month}`} title={`${point.year}-${String(point.month).padStart(2, "0")}: ${fmt(point.organic_etv)} visits`}><i style={{ height: `${Math.max(3, ((n(point.organic_etv) ?? 0) / maxEtv) * 100)}%` }} /><small>{String(point.month).padStart(2, "0")}</small></span>)}</div> : <p className="research-data-note">No history returned for this domain.</p>}</section>
      <section><h3>Ranking distribution</h3><div className="research-distribution">{buckets.map(([label, value]) => <div key={label}><small>{label}</small><span><i style={{ width: `${((n(value) ?? 0) / maxBucket) * 100}%` }} /></span><b>{fmt(value)}</b></div>)}</div></section>
    </div>
    <h3 className="research-subheading">Top organic keywords</h3>
    <RankedKeywordTable rows={report.result} />
    <p className="research-data-note">Traffic, keyword and backlink numbers are third-party estimates for {text(summary.target)} in the selected country, not first-party analytics.</p>
  </div>;
}

function RankedKeywordTable({ rows, paid = false }: { rows: Row[]; paid?: boolean }) {
  return <table className="research-table"><thead><tr><th>Keyword</th><th>Position</th><th>Change</th><th>Volume</th><th>KD</th><th>Intent</th><th>CPC</th>{!paid && <th>Traffic</th>}<th>{paid ? "Ad" : "URL"}</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${text(row.keyword)}-${index}`}>
    <td>{text(row.keyword)}</td><td>{fmt(row.position)}</td><td><PositionChange row={row} /></td><td>{fmt(row.search_volume)}</td><td>{difficultyLabel(row.keyword_difficulty)}</td><td>{intentLabel(row.intent)}</td><td>{fmt(row.cpc, 2)}</td>{!paid && <td>{fmt(row.etv, 1)}</td>}
    <td>{paid ? <><strong>{text(row.title)}</strong><br /><ExternalLink href={row.url}>{shortUrl(row.url)}</ExternalLink></> : <ExternalLink href={row.url}>{shortUrl(row.url)}</ExternalLink>}</td>
  </tr>) : <Empty columns={paid ? 8 : 9} message={paid ? "No paid search ads were found for this domain in the selected country." : "No ranking keywords were returned."} />}</tbody></table>;
}

function KeywordMagic({ report }: { report: ExtendedReport }) {
  const [minVolume, setMinVolume] = useState("");
  const [maxKd, setMaxKd] = useState("");
  const [intent, setIntent] = useState("");
  const [include, setInclude] = useState("");
  const [group, setGroup] = useState("");
  const groups = useMemo(() => {
    const seedWords = new Set(report.query.toLowerCase().split(/\s+/));
    const counts = new Map<string, number>();
    for (const row of report.result) for (const word of new Set(String(row.keyword || "").toLowerCase().split(/\s+/))) if (word.length > 2 && !seedWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
    return [...counts].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [report]);
  const rows = report.result.filter((row) => {
    const keyword = String(row.keyword || "").toLowerCase();
    if (minVolume && (n(row.search_volume) ?? 0) < Number(minVolume)) return false;
    if (maxKd && (n(row.keyword_difficulty) ?? 101) > Number(maxKd)) return false;
    if (intent && row.intent !== intent) return false;
    if (include && !keyword.includes(include.toLowerCase())) return false;
    if (group && !keyword.split(/\s+/).includes(group)) return false;
    return true;
  });
  return <div className="research-table-wrap">
    <div className="research-filters">
      <label>Min. volume<input type="number" min={0} value={minVolume} onChange={(event) => setMinVolume(event.target.value)} /></label>
      <label>Max. KD<input type="number" min={0} max={100} value={maxKd} onChange={(event) => setMaxKd(event.target.value)} /></label>
      <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="">Any</option><option value="informational">Informational</option><option value="navigational">Navigational</option><option value="commercial">Commercial</option><option value="transactional">Transactional</option></select></label>
      <label>Include word<input value={include} onChange={(event) => setInclude(event.target.value)} /></label>
    </div>
    {groups.length > 0 && <div className="research-groups" aria-label="Keyword groups"><button type="button" className={group ? "" : "is-selected"} onClick={() => setGroup("")}>All · {report.result.length}</button>{groups.map(([word, count]) => <button type="button" key={word} className={group === word ? "is-selected" : ""} onClick={() => setGroup(group === word ? "" : word)}>{word} · {count}</button>)}</div>}
    <table className="research-table"><thead><tr><th>Keyword</th><th>Volume</th><th>Trend</th><th>KD</th><th>Intent</th><th>CPC</th><th>Competition</th></tr></thead><tbody>{rows.length ? rows.slice(0, 500).map((row, index) => <tr key={`${text(row.keyword)}-${index}`}><td>{text(row.keyword)}</td><td>{fmt(row.search_volume)}</td><td><Trend values={row.trend} /></td><td>{difficultyLabel(row.keyword_difficulty)}</td><td>{intentLabel(row.intent)}</td><td>{fmt(row.cpc, 2)}</td><td>{fmt(row.competition, 2)}</td></tr>) : <Empty columns={7} message="No keywords match these filters." />}</tbody></table>
    <p className="research-data-note">{rows.length} of {report.result.length} keywords shown. Groups are the most common words that appear alongside “{report.query}”.</p>
  </div>;
}

function LocalGrid({ report }: { report: ExtendedReport }) {
  const summary = report.providerSummary?.[0] || {};
  const size = n(summary.grid_size) ?? 3;
  const cells = [...report.result].sort((a, b) => ((n(a.row) ?? 0) - (n(b.row) ?? 0)) || ((n(a.col) ?? 0) - (n(b.col) ?? 0)));
  const tone = (rank: number | null) => rank === null ? "is-none" : rank <= 3 ? "is-top" : rank <= 10 ? "is-mid" : "is-low";
  return <div className="research-table-wrap">
    <div className="research-metric-grid is-four">
      <article><small>Average map position</small><strong>{fmt(summary.average_rank, 1)}</strong><span>Where you appear</span></article>
      <article><small>Found in Maps</small><strong>{fmt(summary.found)} / {fmt(summary.points)}</strong><span>Grid points</span></article>
      <article><small>In the local 3-pack</small><strong>{fmt(summary.top3)}</strong><span>Points ranked 1–3</span></article>
      <article><small>Grid</small><strong>{size}×{size}</strong><span>{fmt(summary.spacing_km, 1)} km apart</span></article>
    </div>
    <div className="research-grid-map" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>{cells.map((cell, index) => {
      const rank = n(cell.rank); const top = Array.isArray(cell.top) ? cell.top as Row[] : [];
      return <div key={index} className={`research-grid-cell ${tone(rank)}`} title={`${fmt(cell.latitude, 5)}, ${fmt(cell.longitude, 5)}\nTop: ${top.map((item) => text(item.title)).join(" · ")}`}><strong>{rank === null ? "20+" : rank}</strong><small>{top[0] ? text(top[0].title) : "No results"}</small></div>;
    })}</div>
    <p className="research-data-note">Each square is a Google Maps search for “{report.query}” from that point (north at the top). Green is the 3-pack, amber is positions 4–10, red is lower, grey means your business was not in the top 20. Your listing is matched by its website domain.</p>
  </div>;
}

function ShareOfVoice({ report }: { report: ExtendedReport }) {
  const rows = report.result;
  const max = Math.max(1, ...rows.map((row) => n(row.share) ?? 0));
  return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Domain</th><th>Share of voice</th><th>Keywords ranking</th><th>Avg. position</th><th>Est. traffic</th><th>Visibility</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${text(row.domain)}-${index}`} className={row.is_own ? "is-own" : row.is_competitor ? "is-competitor" : ""}>
    <td>{text(row.domain)}{row.is_own ? " (you)" : row.is_competitor ? " (competitor)" : ""}</td>
    <td><span className="research-share"><i style={{ width: `${((n(row.share) ?? 0) / max) * 100}%` }} /><b>{fmt(row.share, 1)}%</b></span></td>
    <td>{fmt(row.keywords_count)}</td><td>{fmt(row.avg_position, 1)}</td><td>{fmt(row.etv)}</td><td>{fmt(row.visibility, 3)}</td>
  </tr>) : <Empty columns={6} message="No domains were returned for these keywords." />}</tbody></table><p className="research-data-note">Share of voice is each domain’s share of the estimated clicks across {report.query.split(", ").length} tracked keywords. Your domain and saved competitors are highlighted.</p></div>;
}

function Cannibalization({ report }: { report: ExtendedReport }) {
  return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Search query</th><th>Impressions</th><th>Clicks</th><th>Competing pages (share · position)</th></tr></thead><tbody>{report.result.length ? report.result.map((row, index) => <tr key={`${text(row.keyword)}-${index}`}><td>{text(row.keyword)}</td><td>{fmt(row.impressions)}</td><td>{fmt(row.clicks)}</td><td>{(Array.isArray(row.pages) ? row.pages as Row[] : []).map((page, pageIndex) => <div key={pageIndex}><ExternalLink href={page.page}>{shortUrl(page.page)}</ExternalLink> · {fmt(page.share, 1)}% · #{fmt(page.position, 1)}</div>)}</td></tr>) : <Empty columns={4} message="No cannibalization found: each search mostly goes to one of your pages." />}</tbody></table><p className="research-data-note">From your Search Console data for the last 28 days. Fix by merging the pages, making one the clear target (internal links, canonical), or giving each page a different topic.</p></div>;
}

export function ExtendedResults({ report, domain }: { report: ExtendedReport; domain: string }) {
  const rows = report.result;
  const summary = report.providerSummary?.[0] || {};
  const target = report.competitorDomain || domain;
  if (report.kind === "domain_overview") return <DomainOverview report={report} />;
  if (report.kind === "keyword_magic") return <KeywordMagic report={report} />;
  if (report.kind === "local_grid") return <LocalGrid report={report} />;
  if (report.kind === "share_of_voice") return <ShareOfVoice report={report} />;
  if (report.kind === "cannibalization") return <Cannibalization report={report} />;
  if (report.kind === "organic_keywords" || report.kind === "paid_keywords") {
    const metrics = obj(report.kind === "paid_keywords" ? summary.paid : summary.organic);
    return <div className="research-table-wrap"><div className="research-metric-grid is-four"><article><small>{report.kind === "paid_keywords" ? "Paid keywords" : "Organic keywords"}</small><strong>{fmt(summary.total_count ?? metrics.count)}</strong><span>{target}</span></article><article><small>Est. traffic / month</small><strong>{fmt(metrics.etv)}</strong><span>Visits</span></article><article><small>Traffic value</small><strong>{fmt(metrics.traffic_cost)}</strong><span>USD per month at CPC</span></article><article><small>Top 3 positions</small><strong>{fmt((n(metrics.pos_1) ?? 0) + (n(metrics.pos_2_3) ?? 0))}</strong><span>{fmt(metrics.is_new)} new · {fmt(metrics.is_lost)} lost</span></article></div><RankedKeywordTable rows={rows} paid={report.kind === "paid_keywords"} /><p className="research-data-note">{rows.length} keywords shown, sorted by {report.kind === "paid_keywords" ? "search volume" : "estimated traffic"}. Third-party estimates for the selected country.</p></div>;
  }
  if (report.kind === "top_pages") return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Page</th><th>Est. traffic</th><th>Keywords</th><th>#1</th><th>2–3</th><th>4–10</th><th>Paid traffic</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}><td><ExternalLink href={row.url}>{shortUrl(row.url)}</ExternalLink></td><td>{fmt(row.etv)}</td><td>{fmt(row.keywords)}</td><td>{fmt(row.pos_1)}</td><td>{fmt(row.pos_2_3)}</td><td>{fmt(row.pos_4_10)}</td><td>{fmt(row.paid_etv)}</td></tr>) : <Empty columns={7} message="No pages were returned." />}</tbody></table><p className="research-data-note">Pages of {target} that win the most estimated organic traffic.</p></div>;
  if (report.kind === "referring_domains") return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Referring domain</th><th>Domain rank</th><th>Backlinks</th><th>Linking pages</th><th>Spam score</th><th>First seen</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}><td>{text(row.domain)}</td><td>{fmt(row.rank)}</td><td>{fmt(row.backlinks)}</td><td>{fmt(row.referring_pages)}</td><td>{fmt(row.spam_score)}</td><td>{date(row.first_seen)}</td></tr>) : <Empty columns={6} message="No referring domains were returned." />}</tbody></table><p className="research-data-note">{fmt(summary.total_count)} referring domains link to {target}; the strongest {rows.length} are shown. A high spam score (over 60) can be a sign of a low-quality or toxic link.</p></div>;
  if (report.kind === "anchors") return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Anchor text</th><th>Backlinks</th><th>Referring domains</th><th>First seen</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}><td>{typeof row.anchor === "string" && row.anchor.trim() ? row.anchor : <em>Empty or image link</em>}</td><td>{fmt(row.backlinks)}</td><td>{fmt(row.referring_domains)}</td><td>{date(row.first_seen)}</td></tr>) : <Empty columns={4} message="No anchors were returned." />}</tbody></table><p className="research-data-note">The text other websites use when they link to {target}.</p></div>;
  if (report.kind === "backlink_list") return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Source page</th><th>Anchor</th><th>Target page</th><th>Type</th><th>Page rank</th><th>{report.backlinkMode === "lost" ? "Last seen" : "First seen"}</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}><td><ExternalLink href={row.url_from}>{shortUrl(row.url_from)}</ExternalLink></td><td>{typeof row.anchor === "string" && row.anchor.trim() ? row.anchor : "—"}</td><td><ExternalLink href={row.url_to}>{shortUrl(row.url_to)}</ExternalLink></td><td>{row.dofollow ? "Follow" : "Nofollow"}{row.is_new ? " · new" : ""}{row.is_lost ? " · lost" : ""}</td><td>{fmt(row.page_rank)}</td><td>{date(report.backlinkMode === "lost" ? row.last_seen : row.first_seen)}</td></tr>) : <Empty columns={6} message={report.backlinkMode === "new" ? "No new backlinks in the last 30 days." : report.backlinkMode === "lost" ? "No lost backlinks were found." : "No backlinks were returned."} />}</tbody></table><p className="research-data-note">{report.backlinkMode === "new" ? "Backlinks first seen in the last 30 days." : report.backlinkMode === "lost" ? "Backlinks that no longer exist, most recent first." : "The strongest backlink from each referring domain."}</p></div>;
  if (report.kind === "backlink_gap") {
    const competitors = Array.isArray(summary.competitors) ? summary.competitors.filter((item): item is string => typeof item === "string") : report.query.split(", ");
    return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Referring domain</th><th>Domain rank</th><th>Links to</th>{competitors.map((competitor) => <th key={competitor}>{competitor}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => { const links = obj(row.links); return <tr key={index}><td>{text(row.domain)}</td><td>{fmt(row.rank)}</td><td>{fmt(row.competitor_count)} of {competitors.length}</td>{competitors.map((competitor) => <td key={competitor}>{links[competitor] === null || links[competitor] === undefined ? "—" : fmt(links[competitor])}</td>)}</tr>; }) : <Empty columns={3 + competitors.length} message="No link gaps found." />}</tbody></table><p className="research-data-note"><Sparkles size={11} aria-hidden="true" /> Websites that link to your competitors but not to {domain}. The ones linking to several competitors are the best outreach prospects.</p></div>;
  }
  return null;
}
