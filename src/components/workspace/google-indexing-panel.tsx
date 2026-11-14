"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, LoaderCircle, Search, Send, XCircle } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Sitemap = { path: string; lastSubmitted: string | null; lastDownloaded: string | null; isPending: boolean; errors: number; warnings: number; submitted: number | null };
type Inspection = { url: string; verdict: string; coverageState: string | null; lastCrawlTime: string | null; pageFetchState: string | null; robotsTxtState: string | null; googleCanonical: string | null; searchConsoleLink: string | null };

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

/** Submit sitemaps to Google and check whether pages are indexed, from inside the app. */
export function GoogleIndexingPanel({ domain, property, siteUrl, canManage }: { domain: string; property: string; siteUrl: string; canManage: boolean }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/search-console/indexing`;
  const [sitemaps, setSitemaps] = useState<Sitemap[]>([]);
  const [canSubmit, setCanSubmit] = useState(true);
  const [sitemapUrl, setSitemapUrl] = useState(() => { try { return new URL("/sitemap.xml", siteUrl).href; } catch { return ""; } });
  const [pageUrl, setPageUrl] = useState(siteUrl);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState<"" | "submit" | "inspect">("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`${base}?property=${encodeURIComponent(property)}`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not load sitemaps.");
    setSitemaps(data.sitemaps || []); setCanSubmit(data.canSubmit !== false);
  }, [base, property]);

  useEffect(() => {
    if (!property) return;
    let active = true;
    fetch(`${base}?property=${encodeURIComponent(property)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not load sitemaps.");
        if (active) { setSitemaps(data.sitemaps || []); setCanSubmit(data.canSubmit !== false); }
      })
      .catch((error) => { if (active) setMessage({ text: error instanceof Error ? error.message : "Could not load sitemaps.", ok: false }); });
    return () => { active = false; };
  }, [base, property]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property, ...body }) });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function submit() {
    setBusy("submit"); setMessage(null);
    try {
      const data = await post({ action: "submit_sitemap", sitemapUrl });
      setMessage({ text: `Sitemap sent to Google: ${data.sitemap}. Google usually reads it within a few hours to a few days.`, ok: true });
      await load();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Submission failed.", ok: false }); } finally { setBusy(""); }
  }

  async function inspect() {
    setBusy("inspect"); setMessage(null); setInspection(null);
    try { setInspection(await post({ action: "inspect", url: pageUrl }) as Inspection); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : "Inspection failed.", ok: false }); } finally { setBusy(""); }
  }

  const indexed = inspection?.verdict === "PASS";
  return (
    <div className="google-indexing">
      <strong className="google-indexing-title"><Send size={13} aria-hidden="true" /> Get this site on Google</strong>

      <div className="google-indexing-block">
        <p>Send your sitemap so Google discovers and crawls your pages.</p>
        {canManage ? (canSubmit ? (
          <div className="google-indexing-row">
            <input aria-label="Sitemap address" value={sitemapUrl} onChange={(event) => setSitemapUrl(event.target.value)} placeholder="https://example.com/sitemap.xml" />
            <button type="button" onClick={submit} disabled={busy !== "" || !sitemapUrl.trim()}>{busy === "submit" ? <><LoaderCircle size={13} className="site-spin" aria-hidden="true" /> Submitting…</> : <><Send size={13} aria-hidden="true" /> Submit sitemap to Google</>}</button>
          </div>
        ) : <p className="google-data-message">To submit sitemaps, click <strong>Reconnect</strong> next to Search Console above and allow the updated access. Reports keep working meanwhile.</p>) : <small>Ask a workspace admin to submit sitemaps.</small>}
        {sitemaps.length > 0 && (
          <div className="google-report-table-wrap"><table className="google-report-table"><thead><tr><th>Sitemap</th><th>Submitted</th><th>Last read by Google</th><th>Pages</th><th>Status</th></tr></thead><tbody>
            {sitemaps.map((item) => <tr key={item.path}><td>{item.path}</td><td>{when(item.lastSubmitted)}</td><td>{item.isPending ? "Waiting for Google" : when(item.lastDownloaded)}</td><td>{item.submitted ?? "—"}</td><td>{item.errors ? `${item.errors} errors` : item.warnings ? `${item.warnings} warnings` : item.isPending ? "Pending" : "OK"}</td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <div className="google-indexing-block">
        <p>Check whether a page is in Google’s index.</p>
        <div className="google-indexing-row">
          <input aria-label="Page address" value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://example.com/page" />
          <button type="button" onClick={inspect} disabled={busy !== "" || !pageUrl.trim()}>{busy === "inspect" ? <><LoaderCircle size={13} className="site-spin" aria-hidden="true" /> Asking Google…</> : <><Search size={13} aria-hidden="true" /> Check on Google</>}</button>
        </div>
        {inspection && (
          <div className={`google-indexing-result ${indexed ? "is-indexed" : "is-missing"}`}>
            <strong>{indexed ? <><CheckCircle2 size={14} aria-hidden="true" /> On Google</> : <><XCircle size={14} aria-hidden="true" /> Not on Google yet</>}</strong>
            <dl>
              <div><dt>Google says</dt><dd>{inspection.coverageState || "No data yet"}</dd></div>
              <div><dt>Last crawled</dt><dd>{when(inspection.lastCrawlTime)}</dd></div>
              {inspection.pageFetchState && <div><dt>Fetch</dt><dd>{inspection.pageFetchState.replaceAll("_", " ").toLowerCase()}</dd></div>}
              {inspection.googleCanonical && <div><dt>Google canonical</dt><dd>{inspection.googleCanonical}</dd></div>}
            </dl>
            {!indexed && <p>To ask Google to crawl this page sooner, open it in Search Console and click <strong>Request indexing</strong> (Google offers that button only there).</p>}
            {inspection.searchConsoleLink && <a href={inspection.searchConsoleLink} target="_blank" rel="noreferrer">Open in Search Console <ExternalLink size={12} aria-hidden="true" /></a>}
          </div>
        )}
      </div>

      {message && <p className={`google-data-message${message.ok ? " is-success" : ""}`} role="status">{message.text}</p>}
    </div>
  );
}
