"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Info, LoaderCircle, Search, Sparkles } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Issue = { ruleId: string; title: string; severity: "critical" | "warning" | "notice"; recommendation: string; evidence: string };
type Result = {
  url: string;
  title: string | null;
  score: number;
  issues: Issue[];
  counts: { critical: number; warning: number; notice: number };
  ai: { scores: { geo: number; aeo: number; llmo: number }; recommendations: string[]; bots: Record<string, string>; llmsTxt: string };
};

const botLabel: Record<string, string> = { allowed_on_root: "Allowed", blocked_on_root: "Blocked", not_specified: "Allowed (no rule)", unknown: "Unknown" };
const scoreTone = (score: number) => (score >= 80 ? "is-good" : score >= 50 ? "is-fair" : "is-poor");

export function SeoChecker() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/public/seo-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "The check failed. Please try again.");
      setResult(data as Result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="seo-checker">
      <form className="seo-checker-form" onSubmit={check}>
        <label htmlFor="seo-checker-url" className="sr-only">Website address</label>
        <input id="seo-checker-url" type="text" inputMode="url" autoComplete="url" placeholder="Enter your website, e.g. example.com" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} />
        <button type="submit" disabled={loading || !url.trim()}>{loading ? <><LoaderCircle size={17} className="seo-checker-spin" aria-hidden="true" /> Checking…</> : <><Search size={17} aria-hidden="true" /> Check my site</>}</button>
      </form>
      <p className="seo-checker-hint">Free · no sign-up · checks one page for SEO health and AI search readiness in about 10 seconds.</p>
      {error && <p className="seo-checker-error" role="alert">{error}</p>}

      {result && (
        <div className="seo-checker-result" aria-live="polite">
          <div className="seo-checker-summary">
            <div className={`seo-checker-score ${scoreTone(result.score)}`}><strong>{result.score}</strong><span>/100</span><small>SEO health</small></div>
            <div className="seo-checker-meta">
              <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
              {result.title && <p>{result.title}</p>}
              <div className="seo-checker-counts"><span className="is-critical">{result.counts.critical} critical</span><span className="is-warning">{result.counts.warning} warnings</span><span className="is-notice">{result.counts.notice} notices</span></div>
            </div>
          </div>

          <section className="seo-checker-panel">
            <h3><Sparkles size={16} aria-hidden="true" /> AI search readiness</h3>
            <div className="seo-checker-bars">
              {(["geo", "aeo", "llmo"] as const).map((key) => (
                <div key={key}><span>{key.toUpperCase()}</span><div className="seo-checker-bar"><i className={scoreTone(result.ai.scores[key])} style={{ width: `${result.ai.scores[key]}%` }} /></div><b>{result.ai.scores[key]}</b></div>
              ))}
            </div>
            <div className="seo-checker-bots">
              <h4><Bot size={14} aria-hidden="true" /> Can AI assistants read this site?</h4>
              <ul>{Object.entries(result.ai.bots).map(([bot, policy]) => <li key={bot} className={policy === "blocked_on_root" ? "is-blocked" : ""}><span>{bot}</span><b>{botLabel[policy] ?? policy}</b></li>)}<li><span>llms.txt</span><b>{result.ai.llmsTxt === "available" ? "Found" : "Not found"}</b></li></ul>
            </div>
            {result.ai.recommendations.length > 0 && <ul className="seo-checker-recs">{result.ai.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>

          <section className="seo-checker-panel">
            <h3><AlertTriangle size={16} aria-hidden="true" /> Issues found on this page</h3>
            {result.issues.length ? (
              <ul className="seo-checker-issues">
                {result.issues.map((issue) => (
                  <li key={issue.ruleId}>
                    <span className={`seo-checker-sev is-${issue.severity}`}>{issue.severity}</span>
                    <div><strong>{issue.title}</strong><p>{issue.recommendation}</p>{issue.evidence && <small><Info size={11} aria-hidden="true" /> {issue.evidence}</small>}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="seo-checker-clean"><CheckCircle2 size={16} aria-hidden="true" /> No issues found on this page.</p>}
          </section>

          <div className="seo-checker-cta">
            <div><strong>This checked one page.</strong><p>Create a free account to crawl your whole site, track keywords and rankings, connect Search Console and get a step-by-step fix plan.</p></div>
            <Link href="/login" className="button-primary">Audit my full site <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
