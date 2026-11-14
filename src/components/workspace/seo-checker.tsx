"use client";

import { useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock3, FileText, Info, LoaderCircle, ScanSearch, Sparkles } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Issue = { ruleId: string; title: string; severity: "critical" | "warning" | "notice"; recommendation: string; evidence: string };
type Facts = {
  status: number; title: string | null; titleLength: number; description: string | null; descriptionLength: number; canonical: string | null; robots: string | null;
  h1: string[]; headingCounts: { h1: number; h2: number; h3: number }; wordCount: number; internalLinks: number; externalLinks: number;
  images: number; imagesMissingAlt: number; schemaTypes: string[]; hreflang: number; cms: string | null;
};
type Result = {
  url: string; finalUrl: string; checkedAt: string; elapsedMs: number; score: number; facts: Facts; issues: Issue[];
  counts: { critical: number; warning: number; notice: number };
  ai: { scores: { geo: number; aeo: number; llmo: number }; recommendations: string[]; bots: Record<string, string>; robotsTxt: boolean; llmsTxt: string };
};

const botLabel: Record<string, string> = { allowed_on_root: "Allowed", blocked_on_root: "Blocked", not_specified: "Allowed (no rule)", unknown: "Unknown" };
const tone = (score: number) => (score >= 80 ? "is-good" : score >= 50 ? "is-fair" : "is-poor");
const lengthNote = (value: number, min: number, max: number) => (value === 0 ? "missing" : value < min ? "short" : value > max ? "long" : "good");

export function SeoChecker({ websites }: { websites: Array<{ domain: string; url: string }> }) {
  const [url, setUrl] = useState(websites[0]?.url ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run(target: string) {
    if (!target.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/seo-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "The check failed. Please try again.");
      setResult(data as Result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const facts = result?.facts;
  return (
    <div className="seo-check">
      <form className="seo-check-form" onSubmit={(event) => { event.preventDefault(); void run(url); }}>
        <label htmlFor="seo-check-url">Page address</label>
        <div className="seo-check-input">
          <input id="seo-check-url" type="text" inputMode="url" autoComplete="url" placeholder="example.com/page" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} />
          <button type="submit" disabled={loading || !url.trim()}>{loading ? <><LoaderCircle size={14} className="site-spin" aria-hidden="true" /> Checking live page…</> : <><ScanSearch size={14} aria-hidden="true" /> Run check</>}</button>
        </div>
        {websites.length > 0 && <div className="seo-check-sites"><span>Your websites:</span>{websites.map((site) => <button type="button" key={site.domain} disabled={loading} onClick={() => { setUrl(site.url); void run(site.url); }}>{site.domain}</button>)}</div>}
      </form>
      {error && <p className="workspace-alert" role="alert">{error}</p>}

      {result && facts && (
        <div className="seo-check-result" aria-live="polite">
          <div className="seo-check-summary">
            <div className={`seo-check-score ${tone(result.score)}`}><strong>{result.score}</strong><small>SEO health</small></div>
            <div className="seo-check-meta">
              <a href={result.finalUrl} target="_blank" rel="noreferrer">{result.finalUrl}</a>
              <p><Clock3 size={12} aria-hidden="true" /> Fetched live {new Date(result.checkedAt).toLocaleString()} · HTTP {facts.status} · {(result.elapsedMs / 1000).toFixed(1)}s{facts.cms ? ` · ${facts.cms}` : ""}</p>
              <div className="seo-check-counts"><span className="is-critical">{result.counts.critical} critical</span><span className="is-warning">{result.counts.warning} warnings</span><span className="is-notice">{result.counts.notice} notices</span></div>
            </div>
          </div>

          <section className="seo-check-panel">
            <h3><FileText size={15} aria-hidden="true" /> What we found on the page</h3>
            <dl className="seo-check-facts">
              <div><dt>Title</dt><dd>{facts.title || "Missing"}<small className={`is-${lengthNote(facts.titleLength, 30, 60)}`}>{facts.titleLength} characters · {lengthNote(facts.titleLength, 30, 60)}</small></dd></div>
              <div><dt>Meta description</dt><dd>{facts.description || "Missing"}<small className={`is-${lengthNote(facts.descriptionLength, 70, 160)}`}>{facts.descriptionLength} characters · {lengthNote(facts.descriptionLength, 70, 160)}</small></dd></div>
              <div><dt>H1</dt><dd>{facts.h1.length ? facts.h1.join(" · ") : "Missing"}<small>{facts.headingCounts.h1} H1 · {facts.headingCounts.h2} H2 · {facts.headingCounts.h3} H3</small></dd></div>
              <div><dt>Canonical</dt><dd>{facts.canonical || "Not set"}</dd></div>
              <div><dt>Robots meta</dt><dd>{facts.robots || "Not set (indexable)"}</dd></div>
              <div><dt>Content</dt><dd>{facts.wordCount.toLocaleString()} words</dd></div>
              <div><dt>Links</dt><dd>{facts.internalLinks} internal · {facts.externalLinks} external</dd></div>
              <div><dt>Images</dt><dd>{facts.images} images{facts.imagesMissingAlt ? ` · ${facts.imagesMissingAlt} missing alt text` : ""}</dd></div>
              <div><dt>Structured data</dt><dd>{facts.schemaTypes.length ? facts.schemaTypes.join(", ") : "None found"}</dd></div>
              {facts.hreflang > 0 && <div><dt>Hreflang</dt><dd>{facts.hreflang} alternates</dd></div>}
            </dl>
          </section>

          <section className="seo-check-panel">
            <h3><AlertTriangle size={15} aria-hidden="true" /> Issues on this page</h3>
            {result.issues.length ? (
              <ul className="seo-check-issues">
                {result.issues.map((issue) => (
                  <li key={issue.ruleId}>
                    <span className={`site-issue-severity is-${issue.severity}`}>{issue.severity}</span>
                    <div><strong>{issue.title}</strong><p>{issue.recommendation}</p>{issue.evidence && <small><Info size={11} aria-hidden="true" /> {issue.evidence}</small>}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="seo-check-clean"><CheckCircle2 size={15} aria-hidden="true" /> No issues found on this page.</p>}
          </section>

          <section className="seo-check-panel">
            <h3><Sparkles size={15} aria-hidden="true" /> AI search readiness</h3>
            <div className="seo-check-bars">
              {(["geo", "aeo", "llmo"] as const).map((key) => (
                <div key={key}><span>{key.toUpperCase()}</span><div className="seo-check-bar"><i className={tone(result.ai.scores[key])} style={{ width: `${result.ai.scores[key]}%` }} /></div><b>{result.ai.scores[key]}</b></div>
              ))}
            </div>
            <h4><Bot size={13} aria-hidden="true" /> AI crawler access (from robots.txt)</h4>
            <ul className="seo-check-bots">
              {Object.entries(result.ai.bots).map(([bot, policy]) => <li key={bot} className={policy === "blocked_on_root" ? "is-blocked" : ""}><span>{bot}</span><b>{botLabel[policy] ?? policy}</b></li>)}
              <li><span>robots.txt</span><b>{result.ai.robotsTxt ? "Found" : "Not found"}</b></li>
              <li><span>llms.txt</span><b>{result.ai.llmsTxt === "available" ? "Found" : "Not found"}</b></li>
            </ul>
            {result.ai.recommendations.length > 0 && <ul className="seo-check-recs">{result.ai.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
          <p className="seo-check-note">This checks one page live. Run a site audit from Websites to crawl every page, track issues and build an action plan.</p>
        </div>
      )}
    </div>
  );
}
