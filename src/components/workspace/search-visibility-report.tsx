"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { SearchVisibilityReport } from "@/lib/seo/search-visibility";
import { readJson } from "@/lib/read-json";

type VisibilitySnapshot = SearchVisibilityReport & {
  sourceAuditId: string;
  sourceAuditCompletedAt: string | Date;
  calculatedAt: string | Date;
};

const dimensions = [
  { key: "geo", label: "GEO", title: "Generative search", description: "Entity identity, authorship, structured context and outbound references." },
  { key: "aeo", label: "AEO", title: "Answer experiences", description: "Question-led headings, FAQ signals and concise answer patterns." },
  { key: "llmo", label: "LLMO", title: "LLM accessibility", description: "Page structure, attribution, structured context and page-level directives." },
] as const;

export function SearchVisibilityReportCard({ domain, initialReports, hasCrawl, canRun }: { domain: string; initialReports: VisibilitySnapshot[]; hasCrawl: boolean; canRun: boolean }) {
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const latest = reports[0];

  async function analyze() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/visibility`, { method: "POST" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Search visibility analysis could not be completed.");
      setReports((previous) => [payload.report as VisibilitySnapshot, ...previous].slice(0, 12));
      setMessage("Analysis saved from the latest website crawl.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search visibility analysis could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="workspace-page-heading visibility-page-heading">
      <div><p className="workspace-eyebrow"><span /> SEARCH EXPERIENCE</p><h1>GEO, AEO &amp; LLMO</h1><p>Review what your sampled pages communicate to answer engines and generative search systems.</p></div>
      <Link href="/dashboard/visibility" className="workspace-outline-link"><ArrowLeft size={15} /> All websites</Link>
    </header>
    <section className="workspace-section visibility-report" aria-labelledby="visibility-report-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">FIRST-PARTY CRAWL SIGNALS</p><h2 id="visibility-report-title">Search experience readiness</h2><p>Scores summarize page-level signals from your most recent crawl. They are not search rankings or measurements of AI citations.</p></div>
        {canRun && <button type="button" className="visibility-run-button" onClick={analyze} disabled={busy || !hasCrawl}>{busy ? <LoaderCircle size={15} className="research-spinner" /> : <RefreshCw size={15} />}{busy ? "Analyzing…" : latest ? "Analyze latest crawl" : "Run analysis"}</button>}
      </div>
      {!hasCrawl ? <div className="visibility-empty"><Sparkles size={19} /><div><strong>Run a website crawl first</strong><p>GEO, AEO and LLMO signals are calculated from pages you have verified and crawled. No example data is shown.</p><Link href="/dashboard/tools">Open SEO tools</Link></div></div> : latest ? <>
        <div className="visibility-score-grid">
          {dimensions.map(({ key, label, title, description }) => {
            const score = latest.scores[key];
            return <article className="visibility-score-card" key={key}>
              <div className="visibility-score-card-head"><span>{label}</span><small>{title}</small></div>
              <strong>{score}<small>/100</small></strong>
              <div className="visibility-progress" role="progressbar" aria-label={`${label} heuristic signal coverage`} aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${score}%` }} /></div>
              <p>{description}</p>
            </article>;
          })}
        </div>
        <p className="visibility-sample-note">Based on {latest.pageCount} sampled pages · Crawl {new Date(latest.sourceAuditCompletedAt).toLocaleString()} · Analysis {new Date(latest.calculatedAt).toLocaleString()} · {latest.version}</p>
        <section className="visibility-crawler-panel" aria-labelledby="visibility-crawler-title">
          <div><p className="workspace-eyebrow">CRAWL ACCESS</p><h3 id="visibility-crawler-title">AI crawler and llms.txt observations</h3><p>Reads the latest crawl’s robots.txt response and checks for a root llms.txt file. These observations do not guarantee access or inclusion.</p></div>
          {latest.crawlerAccess ? <div className="visibility-crawler-grid">
            <div><strong>robots.txt</strong><span>{latest.crawlerAccess.robotsTxt.available ? `Fetched · HTTP ${latest.crawlerAccess.robotsTxt.statusCode ?? "—"}` : `Unavailable${latest.crawlerAccess.robotsTxt.statusCode ? ` · HTTP ${latest.crawlerAccess.robotsTxt.statusCode}` : ""}`}</span></div>
            {Object.entries(latest.crawlerAccess.bots).map(([bot, policy]) => <div key={bot}><strong>{bot}</strong><span>{policy === "allowed_on_root" ? "Homepage allowed by fetched rules" : policy === "blocked_on_root" ? "Homepage blocked by fetched rules" : policy === "not_specified" ? "No specific or wildcard rule" : "Unknown"}</span></div>)}
            <div><strong>llms.txt</strong><span>{latest.crawlerAccess.llmsTxt.status === "available" ? `Found · ${latest.crawlerAccess.llmsTxt.bytes ?? 0} bytes` : latest.crawlerAccess.llmsTxt.status === "not_found" ? "Not found" : "Unavailable"}</span></div>
          </div> : <p className="visibility-crawler-unavailable">This crawl predates crawler access checks. Run a fresh site audit to collect these observations.</p>}
          <small>Homepage policy is derived from the fetched robots.txt directives only. It does not evaluate path-specific policies, prove a crawler followed the rules, or measure retrieval by any AI service.</small>
        </section>
        <div className="visibility-dimension-grid">
          {dimensions.map(({ key, label, title }) => <section className="visibility-dimension" key={key} aria-labelledby={`visibility-${key}`}>
            <h3 id={`visibility-${key}`}><span>{label}</span>{title}</h3>
            <ul>{latest.dimensions[key].signals.map((signal) => <li key={signal.id}>
              <div className="visibility-signal-head"><strong>{signal.label}</strong><span className={`visibility-status is-${signal.status}`}>{signal.score}%</span></div>
              <p>{signal.evidence}</p>
              {signal.status !== "supported" && <small>{signal.recommendation}</small>}
            </li>)}</ul>
          </section>)}
        </div>
        {latest.recommendations.length > 0 && <div className="visibility-recommendations"><h3>Review these opportunities</h3><ul>{latest.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        <div className="visibility-limitations"><strong>How to read this report</strong><ul>{latest.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
        {reports.length > 1 && <div className="visibility-history"><h3>Previous analyses</h3><ol>{reports.slice(1, 7).map((report, index) => <li key={`${report.calculatedAt}-${index}`}><time>{new Date(report.calculatedAt).toLocaleDateString()}</time><span>GEO {report.scores.geo}</span><span>AEO {report.scores.aeo}</span><span>LLMO {report.scores.llmo}</span><small>{report.pageCount} pages</small></li>)}</ol></div>}
      </> : <div className="visibility-empty"><Sparkles size={19} /><div><strong>No analysis has been saved yet</strong><p>Generate a readiness report from the latest completed crawl. The analysis uses first-party heuristics and makes no provider calls.</p>{canRun && <button type="button" onClick={analyze} disabled={busy}>{busy ? "Analyzing…" : "Analyze latest crawl"}</button>}</div></div>}
      {message && <p className={message.startsWith("Analysis saved") ? "research-success" : "research-error"} role={message.startsWith("Analysis saved") ? "status" : "alert"}>{message}</p>}
    </section>
  </>;
}
