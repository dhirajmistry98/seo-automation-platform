import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { PrintButton } from "@/components/workspace/print-button";

export const instant = false;

type Row = Record<string, unknown>;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const date = (value: unknown) => (value instanceof Date ? value.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Small inline SVG trend line for score history (oldest → newest). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 220; const height = 48; const max = 100; const step = width / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 6) - 3).toFixed(1)}`).join(" ");
  return <svg className="report-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Score trend from ${values[0]} to ${values.at(-1)}`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export default async function SiteReportPage({ params }: { params: Promise<{ domain: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) notFound();
  const scope = { organizationId: website.organizationId, websiteDomain: domain };

  const [audits, issueStats, openIssues, pageSpeed, visibility, gsc, tasks, keywords] = await Promise.all([
    db.collection("seo_audits").find({ ...scope, status: "completed" }).sort({ completedAt: -1 }).limit(12).project({ _id: 0, score: 1, pageCount: 1, completedAt: 1, issueCounts: 1 }).toArray(),
    db.collection("seo_issues").aggregate([{ $match: scope }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    db.collection("seo_issues").find({ ...scope, status: "open" }).sort({ severity: 1, lastDetectedAt: -1 }).limit(15).project({ _id: 0, title: 1, severity: 1, pageUrl: 1, recommendation: 1 }).toArray(),
    db.collection("pagespeed_results").find(scope).sort({ retrievedAt: -1 }).limit(10).project({ _id: 0, strategy: 1, categories: 1, retrievedAt: 1, url: 1 }).toArray(),
    db.collection("seo_visibility_reports").find(scope).sort({ calculatedAt: -1 }).limit(1).project({ _id: 0, scores: 1, recommendations: 1, calculatedAt: 1 }).next(),
    db.collection("google_search_console_reports").find({ ...scope, dimension: "query" }).sort({ generatedAt: -1 }).limit(1).project({ _id: 0, rows: 1, startDate: 1, endDate: 1, property: 1 }).next(),
    db.collection("seo_tasks").aggregate([{ $match: scope }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    db.collection("keyword_targets").find({ organizationId: website.organizationId, url: { $regex: `^https?://(www\\.)?${domain.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)` } }).sort({ updatedAt: -1 }).limit(15).project({ _id: 0, url: 1, keyword: 1, history: { $slice: -12 }, updatedAt: 1 }).toArray(),
  ]);

  const latest = audits[0];
  const scoreTrend = audits.map((audit) => num(audit.score)).filter((value): value is number => value !== null).reverse();
  const issuesBy = Object.fromEntries(issueStats.map((row) => [String(row._id), Number(row.count)]));
  const tasksBy = Object.fromEntries(tasks.map((row) => [String(row._id), Number(row.count)]));
  const taskTotal = Object.values(tasksBy).reduce((sum, value) => sum + value, 0);
  const latestSpeed = (strategy: string) => pageSpeed.find((row) => row.strategy === strategy) as Row | undefined;
  const topQueries = ((gsc?.rows as Row[] | undefined) ?? []).slice(0, 15);
  const brand = typeof website.name === "string" && website.name ? website.name : domain;

  return (
    <article className="site-report">
      <div className="site-report-toolbar no-print">
        <Link href="/dashboard/report"><ArrowLeft size={14} aria-hidden="true" /> All reports</Link>
        <PrintButton />
      </div>

      <header className="site-report-head">
        <div><p className="workspace-eyebrow">SEO PERFORMANCE REPORT</p><h1>{brand}</h1><p>{domain} · prepared {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p></div>
        <strong className="site-report-brand">SEO STUDIO</strong>
      </header>

      <section className="site-report-kpis">
        <div><small>SEO health</small><strong>{num(latest?.score) ?? "—"}<span>/100</span></strong><Sparkline values={scoreTrend} /><em>{latest ? `${latest.pageCount} pages · ${date(latest.completedAt)}` : "No audit yet"}</em></div>
        <div><small>Open issues</small><strong>{issuesBy.open ?? 0}</strong><em>{issuesBy.resolved ?? 0} resolved · {issuesBy.ignored ?? 0} ignored</em></div>
        <div><small>Tasks done</small><strong>{tasksBy.done ?? 0}<span>/{taskTotal}</span></strong><em>{tasksBy.in_progress ?? 0} in progress</em></div>
        <div><small>AI readiness</small><strong>{visibility ? Math.round(((num((visibility.scores as Row)?.geo) ?? 0) + (num((visibility.scores as Row)?.aeo) ?? 0) + (num((visibility.scores as Row)?.llmo) ?? 0)) / 3) : "—"}</strong><em>{visibility ? `GEO ${(visibility.scores as Row).geo} · AEO ${(visibility.scores as Row).aeo} · LLMO ${(visibility.scores as Row).llmo}` : "Run a readiness check"}</em></div>
      </section>

      <section className="site-report-section">
        <h2>Page speed (Google PageSpeed Insights)</h2>
        {pageSpeed.length ? <table><thead><tr><th>Device</th><th>Performance</th><th>Accessibility</th><th>Best practices</th><th>SEO</th><th>Date</th></tr></thead><tbody>
          {["mobile", "desktop"].map((strategy) => { const row = latestSpeed(strategy); const categories = (row?.categories ?? {}) as Row; return row ? <tr key={strategy}><td>{strategy}</td><td>{String(categories.performance ?? "—")}</td><td>{String(categories.accessibility ?? "—")}</td><td>{String(categories["best-practices"] ?? "—")}</td><td>{String(categories.seo ?? "—")}</td><td>{date(row.retrievedAt)}</td></tr> : null; })}
        </tbody></table> : <p>No PageSpeed results yet.</p>}
      </section>

      <section className="site-report-section">
        <h2>Top search queries (Google Search Console)</h2>
        {topQueries.length ? <><p>{String(gsc?.startDate)} to {String(gsc?.endDate)}</p><table><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead><tbody>
          {topQueries.map((row, index) => <tr key={index}><td>{(row.keys as string[] | undefined)?.join(" · ") ?? "—"}</td><td>{String(row.clicks ?? 0)}</td><td>{String(row.impressions ?? 0)}</td><td>{typeof row.ctr === "number" ? `${(row.ctr * 100).toFixed(1)}%` : "—"}</td><td>{typeof row.position === "number" ? row.position.toFixed(1) : "—"}</td></tr>)}
        </tbody></table></> : <p>Connect Search Console and run a query report to include real search data.</p>}
      </section>

      <section className="site-report-section">
        <h2>Tracked keywords</h2>
        {keywords.length ? <table><thead><tr><th>Keyword</th><th>Page</th><th>On-page score</th><th>Change</th><th>Google</th></tr></thead><tbody>
          {keywords.map((row) => { const history = (row.history as Row[]) ?? []; const last = history.at(-1); const first = history[0]; const change = last && first && history.length > 1 ? Number(last.score) - Number(first.score) : 0; return <tr key={`${row.url}-${row.keyword}`}><td>{String(row.keyword)}</td><td>{String(row.url).replace(/^https?:\/\//, "")}</td><td>{String(last?.score ?? "—")}</td><td>{change ? `${change > 0 ? "+" : ""}${change}` : "—"}</td><td>{num(last?.position) ? `#${Math.round(Number(last?.position))}` : "—"}</td></tr>; })}
        </tbody></table> : <p>Use Rank a page to start tracking keywords for this site.</p>}
      </section>

      <section className="site-report-section">
        <h2>Priority issues to fix</h2>
        {openIssues.length ? <table><thead><tr><th>Severity</th><th>Issue</th><th>Page</th><th>Recommendation</th></tr></thead><tbody>
          {openIssues.map((issue, index) => <tr key={index}><td><span className={`site-issue-severity is-${String(issue.severity)}`}>{String(issue.severity)}</span></td><td>{String(issue.title)}</td><td>{String(issue.pageUrl).replace(/^https?:\/\/[^/]+/, "") || "/"}</td><td>{String(issue.recommendation ?? "")}</td></tr>)}
        </tbody></table> : <p>No open issues. 🎉</p>}
      </section>

      {visibility && Array.isArray(visibility.recommendations) && visibility.recommendations.length > 0 && (
        <section className="site-report-section">
          <h2>AI search recommendations</h2>
          <ul>{(visibility.recommendations as string[]).slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      )}

      <footer className="site-report-foot">Generated by SEO STUDIO from first-party crawls and connected Google data. Scores reflect the latest stored results on the date above.</footer>
    </article>
  );
}
