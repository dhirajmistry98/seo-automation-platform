"use client";

import { useState, type ReactNode } from "react";
import { LineChart, RingScore } from "@/components/workspace/charts";

type Totals = { clicks: number; impressions: number; position: number | null; keywords: number; visibility: number | null };
type Move = { query: string; from: number; to: number; change: number; impressions: number };
type Data = {
  period: { startDate: string; endDate: string }; countries: string[]; totals: Totals; previousTotals: Totals;
  distribution: Array<{ label: string; count: number }>; previousDistribution: Array<{ label: string; count: number }>;
  trend: Array<Totals & { date: string }>; trendTruncated: boolean;
  tracked: Array<{ keyword: string; position: number | null; previous: number | null; clicks: number; impressions: number }>;
  movements: { winners: Move[]; losers: Move[]; newQueries: number; lostQueries: number };
  decay: Array<{ page: string; before: number; now: number; drop: number; positionBefore: number; positionNow: number | null }>;
  lowCtr: Array<{ query: string; position: number; impressions: number; ctr: number; typical: number; missed: number }>;
  brand: { terms: string[]; brand: Totals; nonBrand: Totals };
  landing: Array<{ page: string; clicks: number; impressions: number; position: number; analytics: { sessions: number; engagementRate: number; conversions: number } | null }>;
  analyticsRange: { startDate: string; endDate: string } | null;
};
type Vitals = { origin: string; message?: string; metrics: Array<{ id: string; label: string; unit: string; latest: number | null; rating: string | null; points: Array<{ date: string; value: number }> }> };

const TABS = ["Positions", "Winners & losers", "Content decay", "Low CTR", "Brand split", "Landing pages", "Field speed"] as const;
const n = (value: number) => value.toLocaleString("en-IN");
const countryName = (code: string) => code.toUpperCase();

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="gin-empty">{empty}</p>;
  return <div className="gin-scroll"><table className="gin-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function Stat({ label, value, before, lowerIsBetter }: { label: string; value: number | null; before: number | null; lowerIsBetter?: boolean }) {
  const change = value !== null && before !== null ? Math.round((value - before) * 10) / 10 : null;
  const good = change !== null && change !== 0 && (lowerIsBetter ? change < 0 : change > 0);
  return <article className="gin-stat"><small>{label}</small><strong>{value === null ? "—" : n(value)}</strong><em className={change ? (good ? "is-up" : "is-down") : ""}>{change === null ? "no earlier data" : change === 0 ? "no change" : `${change > 0 ? "+" : ""}${n(change)} vs previous`}</em></article>;
}

async function post(domain: string, path: string, body: unknown) {
  const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The report failed. Please try again.");
  return data;
}

export function SearchInsightsPanel({ domain }: { domain: string }) {
  const [days, setDays] = useState(28);
  const [country, setCountry] = useState("");
  const [device, setDevice] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Positions");
  const [data, setData] = useState<Data | null>(null);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [formFactor, setFormFactor] = useState("PHONE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await task(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reach the server."); }
    finally { setBusy(false); }
  }
  const load = () => run(async () => { setData(await post(domain, "search-insights", { days, country, device })); });
  const loadVitals = (factor: string) => run(async () => { setFormFactor(factor); setVitals(await post(domain, "field-data", { formFactor: factor })); });

  return <section className="workspace-panel gin" aria-label="Search insights">
    <form className="gin-filters" onSubmit={(e) => { e.preventDefault(); void load(); }}>
      <label>Period<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={28}>Last 28 days</option><option value={90}>Last 90 days</option></select></label>
      <label>Device<select value={device} onChange={(e) => setDevice(e.target.value)}><option value="">All devices</option><option value="MOBILE">Mobile</option><option value="DESKTOP">Desktop</option><option value="TABLET">Tablet</option></select></label>
      <label>Country<select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">All countries</option>{(data?.countries ?? []).map((code) => <option key={code} value={code}>{countryName(code)}</option>)}</select></label>
      <button type="submit" disabled={busy}>{busy ? "Loading…" : data ? "Update report" : "Run report"}</button>
    </form>
    <nav className="gin-tabs" aria-label="Report sections">{TABS.map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {error && <p role="alert" className="gin-error">{error}</p>}

    {tab === "Field speed" ? <div>
      <p className="gin-empty">Speed measured from real Chrome visitors (75th percentile), week by week. This does not use the filters above.</p>
      <div className="gin-tabs"><button type="button" aria-pressed={formFactor === "PHONE"} disabled={busy} onClick={() => void loadVitals("PHONE")}>Load phone data</button><button type="button" aria-pressed={formFactor === "DESKTOP"} disabled={busy} onClick={() => void loadVitals("DESKTOP")}>Load desktop data</button></div>
      {vitals?.message && <p className="gin-empty">{vitals.message}</p>}
      <div className="gin-grid">{vitals?.metrics.map((metric) => <article key={metric.id} className="gin-card"><h3>{metric.label}</h3><p><strong>{metric.latest === null ? "—" : `${metric.latest}${metric.unit}`}</strong> {metric.rating && <em className={metric.rating === "good" ? "is-up" : "is-down"}>{metric.rating}</em>}</p><LineChart points={metric.points.map((p) => ({ label: p.date.slice(5), value: p.value }))} label={metric.label} unit={metric.unit} /></article>)}</div>
    </div> : !data ? <p className="gin-empty">Choose filters and select <strong>Run report</strong>. Data comes from your Google Search Console property.</p> : <>
      <p className="gin-empty">{data.period.startDate} to {data.period.endDate}, compared with the {days} days before.</p>
      {tab === "Positions" && <>
        <div className="gin-grid">
          <article className="gin-stat"><small>Visibility</small><RingScore value={data.totals.visibility} suffix="%" label="Visibility" size={72} /><em>previous {data.previousTotals.visibility ?? "—"}{data.previousTotals.visibility === null ? "" : "%"}</em></article>
          <Stat label="Clicks" value={data.totals.clicks} before={data.previousTotals.clicks} />
          <Stat label="Impressions" value={data.totals.impressions} before={data.previousTotals.impressions} />
          <Stat label="Average position" value={data.totals.position} before={data.previousTotals.position} lowerIsBetter />
          <Stat label="Keywords" value={data.totals.keywords} before={data.previousTotals.keywords} />
        </div>
        <p className="gin-empty">Visibility estimates the share of possible clicks your positions capture, compared with ranking first for every query.</p>
        <div className="gin-grid is-wide">
          <article className="gin-card"><LineChart points={data.trend.map((d) => ({ label: d.date.slice(5), value: d.visibility ?? 0 }))} label="Daily visibility" unit="%" /></article>
          <article className="gin-card"><LineChart points={data.trend.map((d) => ({ label: d.date.slice(5), value: d.clicks }))} label="Daily clicks" /></article>
        </div>
        {data.trendTruncated && <p className="gin-empty">Your site has more data than one request returns, so the daily trend covers the first 25,000 rows.</p>}
        <h3>Ranking distribution</h3>
        <Table head={["Position", "Keywords now", "Previous"]} empty="" rows={data.distribution.map((b, i) => [b.label, n(b.count), n(data.previousDistribution[i].count)])} />
        <h3>Your tracked keywords</h3>
        <Table head={["Keyword", "Position", "Previous", "Clicks", "Impressions"]} empty="Add primary keywords in website settings to track them here." rows={data.tracked.map((k) => [k.keyword, k.position ?? "Not seen", k.previous ?? "—", n(k.clicks), n(k.impressions)])} />
      </>}
      {tab === "Winners & losers" && <>
        <p className="gin-empty">{n(data.movements.newQueries)} new queries and {n(data.movements.lostQueries)} no longer seen. Queries need at least 10 impressions in both periods.</p>
        <h3>Moved up</h3><Table head={["Query", "Was", "Now", "Gain", "Impressions"]} empty="No query moved up." rows={data.movements.winners.map((m) => [m.query, m.from, m.to, <em key="c" className="is-up">+{m.change}</em>, n(m.impressions)])} />
        <h3>Moved down</h3><Table head={["Query", "Was", "Now", "Drop", "Impressions"]} empty="No query moved down." rows={data.movements.losers.map((m) => [m.query, m.from, m.to, <em key="c" className="is-down">{m.change}</em>, n(m.impressions)])} />
      </>}
      {tab === "Content decay" && <Table head={["Page", "Clicks before", "Clicks now", "Drop", "Position before → now"]} empty="No page lost 25% or more of its clicks." rows={data.decay.map((p) => [<a key="p" href={/^https?:/.test(p.page) ? p.page : undefined} target="_blank" rel="noopener noreferrer">{p.page}</a>, n(p.before), n(p.now), <em key="d" className="is-down">-{p.drop}%</em>, `${p.positionBefore} → ${p.positionNow ?? "gone"}`])} />}
      {tab === "Low CTR" && <><p className="gin-empty">Page-one queries clicked less than half as often as is typical. Improve their titles and descriptions. “Possible clicks” is an estimate.</p><Table head={["Query", "Position", "Impressions", "Your CTR", "Typical CTR", "Possible clicks"]} empty="Nothing stands out: no page-one query is far below typical." rows={data.lowCtr.map((r) => [r.query, r.position, n(r.impressions), `${r.ctr}%`, `${r.typical}%`, n(r.missed)])} /></>}
      {tab === "Brand split" && <><p className="gin-empty">Brand terms used: {data.brand.terms.join(", ") || "none"}. Google hides some rare queries, so totals can be lower than your property totals.</p><Table head={["Traffic", "Queries", "Clicks", "Impressions", "Average position"]} empty="" rows={([["Brand", data.brand.brand], ["Non-brand", data.brand.nonBrand]] as const).map(([label, t]) => [label, n(t.keywords), n(t.clicks), n(t.impressions), t.position ?? "—"])} /></>}
      {tab === "Landing pages" && <><p className="gin-empty">{data.analyticsRange ? `Analytics columns come from your latest GA4 report (${data.analyticsRange.startDate} to ${data.analyticsRange.endDate}), which may cover different dates.` : "Run a Google Analytics report in Integrations to add sessions and conversions."}</p><Table head={["Page", "Clicks", "Impressions", "Position", "Sessions", "Engaged", "Conversions"]} empty="No pages in this period." rows={data.landing.map((p) => [p.page, n(p.clicks), n(p.impressions), p.position, p.analytics ? n(p.analytics.sessions) : "—", p.analytics ? `${p.analytics.engagementRate}%` : "—", p.analytics ? n(p.analytics.conversions) : "—"])} /></>}
    </>}
  </section>;
}
