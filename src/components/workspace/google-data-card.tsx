"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Service = { service: string; label: string; status: string; providerEmail?: string | null };
type Property = { siteUrl: string; permissionLevel?: string };
type SearchRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SearchComparison = { keys: string[]; clicks: { current: number; previous: number; changePercent: number | null } };
type GoogleAccount = { name: string; accountName?: string; title?: string };
type AnalyticsProperty = { property: string; displayName: string };
type MerchantResult = { productPerformanceView?: { date?: { year?: number; month?: number; day?: number }; clicks?: string; impressions?: string; clickThroughRate?: number; conversions?: number } };
type BusinessLocation = { name: string; title?: string; storefrontAddress?: { locality?: string; regionCode?: string } };
export function GoogleDataCard({ domain, canConnect }: { domain: string; canConnect: boolean }) {
  const [services, setServices] = useState<Service[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [property, setProperty] = useState("");
  const [dimension, setDimension] = useState("query");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [analyticsPropertyId, setAnalyticsPropertyId] = useState("");
  const [analyticsProperties, setAnalyticsProperties] = useState<AnalyticsProperty[]>([]);
  const [searchComparison, setSearchComparison] = useState<SearchComparison[]>([]);
  const [searchOpportunityCount, setSearchOpportunityCount] = useState(0);
  const [analyticsReport, setAnalyticsReport] = useState<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>; comparison?: Record<string, { current: number; previous: number; changePercent: number | null }>; landingPages?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>; dateRange?: { startDate: string; endDate: string }; previousDateRange?: { startDate: string; endDate: string } } | null>(null);
  const [merchantAccounts, setMerchantAccounts] = useState<GoogleAccount[]>([]);
  const [merchantAccountId, setMerchantAccountId] = useState("");
  const [merchantRows, setMerchantRows] = useState<MerchantResult[]>([]);
  const [businessAccounts, setBusinessAccounts] = useState<GoogleAccount[]>([]);
  const [businessAccount, setBusinessAccount] = useState("");
  const [businessLocations, setBusinessLocations] = useState<BusinessLocation[]>([]);
  const [businessLocation, setBusinessLocation] = useState("");
  const [businessSeries, setBusinessSeries] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/integrations/google/status?domain=${encodeURIComponent(domain)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not read Google connections.");
        if (active) setServices(data.services || []);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not read Google connections."); });
    return () => { active = false; };
  }, [domain]);
  useEffect(() => {
    if (!services.some((item) => item.service === "search_console" && item.status === "connected")) return;
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/search-console`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not list Search Console properties.");
        const next = data.properties as Property[];
        if (active) {
          setProperties(next);
          setProperty((current) => current && next.some((item) => item.siteUrl === current) ? current : next[0]?.siteUrl || "");
        }
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not list Search Console properties."); });
    return () => { active = false; };
  }, [services, domain]);
  useEffect(() => {
    if (!services.some((item) => item.service === "analytics" && item.status === "connected")) return;
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/analytics`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not list GA4 properties.");
        const next = (data.properties || []) as AnalyticsProperty[];
        if (active) {
          setAnalyticsProperties(next);
          setAnalyticsPropertyId((current) => current && next.some((item) => item.property === `properties/${current}`) ? current : next[0]?.property.split("/").at(-1) || current);
        }
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not list GA4 properties."); });
    return () => { active = false; };
  }, [services, domain]);
  async function runReport() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/search-console`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property, dimension }) });
      const data = await readJson(response); if (!response.ok) throw new Error(data.error || "Search Console report failed.");
      setRows(data.report.rows || []); setSearchComparison(data.report.comparisonRows || []); setSearchOpportunityCount((data.report.queryOpportunities || []).length); setMessage(`${data.report.rowCount} rows from ${data.report.startDate} through ${data.report.endDate}; compared with the previous period.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Search Console report failed."); } finally { setBusy(false); }
  }
  async function runAnalytics() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/analytics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: analyticsPropertyId }) });
      const data = await readJson(response); if (!response.ok) throw new Error(data.error || "Analytics report failed.");
      setAnalyticsReport(data.report); setMessage(`GA4 Organic Search report loaded for ${data.report.dateRange.startDate} through ${data.report.dateRange.endDate}, compared with the prior period.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Analytics report failed."); } finally { setBusy(false); }
  }
  async function loadMerchantAccounts() {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/merchant-center`, { cache: "no-store" }); const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not list Merchant Center accounts.");
    setMerchantAccounts(data.accounts || []); setMerchantAccountId((data.accounts || [])[0]?.name?.replace("accounts/", "") || "");
  }
  async function runMerchantReport() {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/merchant-center`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: merchantAccountId }) }); const data = await readJson(response); if (!response.ok) throw new Error(data.error || "Merchant report failed."); setMerchantRows(data.report.results || []); setMessage(`Merchant report loaded for ${data.startDate} through ${data.endDate}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Merchant report failed."); } finally { setBusy(false); }
  }
  async function loadBusinessAccounts() {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/business-profile`, { cache: "no-store" }); const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not list Business Profile accounts.");
    const next = data.accounts || []; setBusinessAccounts(next); setBusinessAccount(next[0]?.name || ""); if (next[0]?.name) await loadBusinessLocations(next[0].name);
  }
  async function loadBusinessLocations(account: string) {
    if (!account) return;
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/business-profile?account=${encodeURIComponent(account)}`, { cache: "no-store" }); const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not list Business Profile locations.");
    const next = data.locations || []; setBusinessLocations(next); setBusinessLocation(next[0]?.name || "");
  }
  async function runBusinessReport() {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/business-profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationName: businessLocation }) }); const data = await readJson(response); if (!response.ok) throw new Error(data.error || "Business Profile report failed."); setBusinessSeries(data.report); setMessage(`Business Profile report loaded through ${data.endDate.year}-${data.endDate.month}-${data.endDate.day}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Business Profile report failed."); } finally { setBusy(false); }
  }
  return <details className="google-data-card"><summary><BarChart3 size={15} /> Google integrations & reports <span>{services.filter((item) => item.status === "connected").length} connected</span></summary>
    <div className="google-data-content"><p>Connect Google-owned data for this website. Each connection uses read or service-specific API access approved on Google&apos;s consent screen.</p>
      <div className="google-service-list">{services.map((item) => <article key={item.service}><div><strong>{item.label}</strong><small>{item.status === "connected" ? `Connected${item.providerEmail ? ` as ${item.providerEmail}` : ""}` : "Not connected"}</small></div>{canConnect ? <a href={`/api/integrations/google/${item.service}/authorize?domain=${encodeURIComponent(domain)}`}>{item.status === "connected" ? "Reconnect" : "Connect"} <ExternalLink size={12} /></a> : <small>{item.status === "connected" ? "Available" : "Admin access required"}</small>}</article>)}</div>
      {services.some((item) => item.service === "search_console" && item.status === "connected") && <div className="google-search-report"><div className="google-report-controls"><label>Property<select value={property} onChange={(event) => setProperty(event.target.value)}>{properties.map((item) => <option value={item.siteUrl} key={item.siteUrl}>{item.siteUrl}</option>)}</select></label><label>Group by<select value={dimension} onChange={(event) => setDimension(event.target.value)}>{["query", "page", "country", "device", "date"].map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" disabled={busy || !property} onClick={runReport}>{busy ? <LoaderCircle className="site-spin" size={13} /> : <RefreshCw size={13} />} Run Search Console report</button></div>
        {searchOpportunityCount > 0 && dimension === "query" && <p className="google-data-message">{searchOpportunityCount} queries have at least 100 impressions and an average position between 4 and 20. Treat these as review candidates, not guaranteed ranking gains.</p>}
        {!!rows.length && <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>{dimension}</th><th>Clicks</th><th>Clicks vs prior</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead><tbody>{rows.map((row, index) => { const comparison = searchComparison.find((item) => item.keys.join("\u0000") === (row.keys || []).join("\u0000")); const change = comparison?.clicks.changePercent; return <tr key={`${row.keys?.join("-")}-${index}`}><td>{row.keys?.join(" · ") || "—"}</td><td>{row.clicks ?? "—"}</td><td>{change === null || change === undefined ? "No prior baseline" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</td><td>{row.impressions ?? "—"}</td><td>{typeof row.ctr === "number" ? `${(row.ctr * 100).toFixed(1)}%` : "—"}</td><td>{typeof row.position === "number" ? row.position.toFixed(1) : "—"}</td></tr>; })}</tbody></table></div>}
      </div>}
      {services.some((item) => item.service === "analytics" && item.status === "connected") && <div className="google-search-report"><div className="google-report-controls"><label>GA4 property{analyticsProperties.length ? <select value={analyticsProperties.find((item) => item.property.endsWith(`/${analyticsPropertyId}`))?.property || ""} onChange={(event) => setAnalyticsPropertyId(event.target.value.split("/").at(-1) || "")}>{analyticsProperties.map((item) => <option value={item.property} key={item.property}>{item.displayName} · {item.property.split("/").at(-1)}</option>)}</select> : <input inputMode="numeric" value={analyticsPropertyId} onChange={(event) => setAnalyticsPropertyId(event.target.value)} placeholder="123456789" />}</label><button type="button" disabled={busy || !analyticsPropertyId} onClick={runAnalytics}>{busy ? <LoaderCircle className="site-spin" size={13} /> : <RefreshCw size={13} />} Run Analytics report</button></div>
        {analyticsReport?.comparison && <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>Organic Search metric</th><th>Current period</th><th>Previous period</th><th>Change</th></tr></thead><tbody>{["sessions", "activeUsers", "screenPageViews", "conversions", "engagedSessions", "engagementRate"].map((metric) => { const item = analyticsReport.comparison?.[metric]; return <tr key={metric}><td>{metric === "activeUsers" ? "Active users" : metric === "screenPageViews" ? "Page views" : metric === "engagedSessions" ? "Engaged sessions" : metric === "engagementRate" ? "Engagement rate" : metric === "conversions" ? "Conversions" : "Sessions"}</td><td>{metric === "engagementRate" ? `${((item?.current || 0) * 100).toFixed(1)}%` : (item?.current ?? "—")}</td><td>{metric === "engagementRate" ? `${((item?.previous || 0) * 100).toFixed(1)}%` : (item?.previous ?? "—")}</td><td>{item?.changePercent === null || item?.changePercent === undefined ? "No prior baseline" : `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(1)}%`}</td></tr>; })}</tbody></table></div>}
        {analyticsReport?.rows?.length ? <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>Date</th><th>Active users</th><th>Sessions</th><th>Page views</th><th>Conversions</th><th>Engaged sessions</th><th>Engagement rate</th></tr></thead><tbody>{analyticsReport.rows.map((row, index) => <tr key={index}><td>{row.dimensionValues?.[0]?.value || "—"}</td>{row.metricValues?.map((value, metricIndex) => <td key={metricIndex}>{metricIndex === 5 && value.value ? `${(Number(value.value) * 100).toFixed(1)}%` : value.value ?? "—"}</td>)}</tr>)}</tbody></table></div> : null}
        {!!analyticsReport?.landingPages?.length && <div className="google-report-table-wrap"><strong>Organic landing pages</strong><table className="google-report-table"><thead><tr><th>Landing page</th><th>Active users</th><th>Sessions</th><th>Engaged sessions</th><th>Engagement rate</th><th>Conversions</th></tr></thead><tbody>{analyticsReport.landingPages.slice(0, 100).map((row, index) => <tr key={index}><td>{row.dimensionValues?.[0]?.value || "—"}</td>{row.metricValues?.map((value, metricIndex) => <td key={metricIndex}>{metricIndex === 3 && value.value ? `${(Number(value.value) * 100).toFixed(1)}%` : value.value ?? "—"}</td>)}</tr>)}</tbody></table></div>}
      </div>}
      {services.some((item) => item.service === "merchant_center" && item.status === "connected") && <div className="google-search-report"><div className="google-report-controls"><button type="button" onClick={() => loadMerchantAccounts().catch((error) => setMessage(error.message))}>Load Merchant accounts</button>{!!merchantAccounts.length && <><label>Account<select value={merchantAccountId} onChange={(event) => setMerchantAccountId(event.target.value)}>{merchantAccounts.map((item) => <option key={item.name} value={item.name.replace("accounts/", "")}>{item.accountName || item.name}</option>)}</select></label><button type="button" disabled={busy || !merchantAccountId} onClick={runMerchantReport}>{busy ? "Loading…" : "Run product report"}</button></>}</div>{!!merchantRows.length && <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>Date</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Conversions</th></tr></thead><tbody>{merchantRows.map((item, index) => { const row = item.productPerformanceView || {}; const date = row.date; return <tr key={index}><td>{date ? `${date.year}-${date.month}-${date.day}` : "—"}</td><td>{row.clicks ?? "—"}</td><td>{row.impressions ?? "—"}</td><td>{typeof row.clickThroughRate === "number" ? `${(row.clickThroughRate * 100).toFixed(1)}%` : "—"}</td><td>{row.conversions ?? "—"}</td></tr>; })}</tbody></table></div>}</div>}
      {services.some((item) => item.service === "business_profile" && item.status === "connected") && <div className="google-search-report"><div className="google-report-controls"><button type="button" onClick={() => loadBusinessAccounts().catch((error) => setMessage(error.message))}>Load Business Profile accounts</button>{!!businessAccounts.length && <label>Account<select value={businessAccount} onChange={(event) => { setBusinessAccount(event.target.value); loadBusinessLocations(event.target.value).catch((error) => setMessage(error.message)); }}>{businessAccounts.map((item) => <option key={item.name} value={item.name}>{item.accountName || item.name}</option>)}</select></label>} {!!businessLocations.length && <><label>Location<select value={businessLocation} onChange={(event) => setBusinessLocation(event.target.value)}>{businessLocations.map((item) => <option key={item.name} value={item.name}>{item.title || item.name}</option>)}</select></label><button type="button" disabled={busy || !businessLocation} onClick={runBusinessReport}>{busy ? "Loading…" : "Run performance report"}</button></>}</div>{businessSeries && <pre className="google-business-json">{JSON.stringify(businessSeries, null, 2)}</pre>}</div>}
      {message && <p className="google-data-message" role="status">{message}</p>}
    </div>
  </details>;
}
