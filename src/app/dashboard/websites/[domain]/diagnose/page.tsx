import { connection } from "next/server";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Zap, AlertTriangle, TrendingDown, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { searchConsoleContext } from "@/lib/integrations/free-research";

export const instant = false;

function diagnoseDates() {
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 112 * 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    ninetyDaysAgo: new Date(Date.now() - 90 * 86_400_000),
  };
}

function fmtDate(value: unknown) {
  if (!value) return "—";
  try { return new Date(String(value)).toLocaleDateString(undefined, { day: "numeric", month: "short" }); } catch { return "—"; }
}

function scoreClass(score: number) {
  if (score >= 80) return "is-good";
  if (score >= 50) return "is-warn";
  return "is-bad";
}

type GscWeek = { weekStart: string; impressions: number; clicks: number };

export default async function DiagnosePage({ params }: { params: Promise<{ domain: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) notFound();

  const { startDate, endDate, ninetyDaysAgo } = diagnoseDates();

  // Fetch audit history, pagespeed history, and new critical issues in parallel
  const [audits, pagespeedResults, newCritical] = await Promise.all([
    db.collection("seo_audits")
      .find({ organizationId: website.organizationId, websiteDomain: domain, status: "completed" })
      .sort({ completedAt: -1 })
      .limit(12)
      .project({ auditId: 1, score: 1, issueCounts: 1, completedAt: 1 })
      .toArray(),
    db.collection("pagespeed_results")
      .find({ organizationId: website.organizationId, websiteDomain: domain })
      .sort({ retrievedAt: -1 })
      .limit(10)
      .project({ score: 1, strategy: 1, url: 1, retrievedAt: 1 })
      .toArray(),
    db.collection("seo_issues")
      .find({
        organizationId: website.organizationId,
        websiteDomain: domain,
        severity: { $in: ["critical", "warning"] },
        firstDetectedAt: { $gte: ninetyDaysAgo },
      })
      .sort({ firstDetectedAt: -1 })
      .limit(20)
      .project({ ruleId: 1, severity: 1, pageUrl: 1, firstDetectedAt: 1 })
      .toArray(),
  ]);

  // Fetch GSC 16-week impressions trend
  const gscWeeks: GscWeek[] = [];
  let gscConnected = false;
  try {
    const gscCtx = await searchConsoleContext(db, website.organizationId, domain);
    if (gscCtx) {
      const response = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscCtx.property)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${gscCtx.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate,
            endDate,
            dimensions: ["date"],
            rowLimit: 500,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (response.ok) {
        type DayRow = { keys?: string[]; impressions?: number; clicks?: number };
        const payload = await response.json() as { rows?: DayRow[] };
        // Aggregate days into weeks (Mon–Sun)
        const byWeek = new Map<string, { impressions: number; clicks: number }>();
        for (const row of payload.rows ?? []) {
          const date = row.keys?.[0];
          if (!date) continue;
          const d = new Date(date);
          const dow = d.getUTCDay(); // 0=Sun
          const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
          const mon = new Date(d.getTime() + diff * 86_400_000).toISOString().slice(0, 10);
          const existing = byWeek.get(mon) ?? { impressions: 0, clicks: 0 };
          existing.impressions += row.impressions ?? 0;
          existing.clicks += row.clicks ?? 0;
          byWeek.set(mon, existing);
        }
        for (const [weekStart, data] of [...byWeek.entries()].sort()) {
          gscWeeks.push({ weekStart, impressions: data.impressions, clicks: data.clicks });
        }
        gscConnected = gscWeeks.length > 0;
      }
    }
  } catch {}

  // Build diagnosis findings
  type Finding = { kind: "drop" | "spike" | "issues"; title: string; detail: string };
  const findings: Finding[] = [];

  // Audit score drops
  const sortedAudits = [...audits].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  for (let i = 1; i < sortedAudits.length; i++) {
    const prev = Number(sortedAudits[i - 1].score ?? 0);
    const curr = Number(sortedAudits[i].score ?? 0);
    if (prev - curr >= 6) {
      findings.push({
        kind: "drop",
        title: `Audit score dropped ${(prev - curr).toFixed(0)} points`,
        detail: `Fell from ${prev} to ${curr} at the audit on ${fmtDate(sortedAudits[i].completedAt)}.`,
      });
    }
  }

  // GSC impression drops week-over-week
  for (let i = 1; i < gscWeeks.length; i++) {
    const prev = gscWeeks[i - 1].impressions;
    const curr = gscWeeks[i].impressions;
    if (prev > 50 && curr < prev * 0.75) {
      const pct = Math.round((1 - curr / prev) * 100);
      findings.push({
        kind: "drop",
        title: `Traffic dropped ${pct}% week of ${gscWeeks[i].weekStart}`,
        detail: `Impressions fell from ${prev.toLocaleString()} to ${curr.toLocaleString()} compared to the prior week.`,
      });
    }
  }

  // New critical issues
  if (newCritical.length >= 3) {
    findings.push({
      kind: "issues",
      title: `${newCritical.length} critical/warning issues detected recently`,
      detail: `These were first found in the last 90 days and may explain recent ranking changes.`,
    });
  }

  // No data at all
  const hasData = audits.length > 0 || gscConnected || pagespeedResults.length > 0;

  return (
    <div className="website-settings-page">
      <section className="website-settings-card diagnose-card">
        <Link href={`/dashboard/websites/${encodeURIComponent(domain)}`} className="website-settings-back">
          <ArrowLeft size={14} /> Back to website
        </Link>
        <p className="workspace-eyebrow">ROOT-CAUSE DETECTIVE</p>
        <h1>Traffic &amp; ranking diagnosis</h1>
        <p className="website-settings-intro">
          Correlates audit history, PageSpeed scores, and Search Console trends to surface the most likely causes of ranking drops.
        </p>

        {!hasData && (
          <div className="action-engine-empty">
            <Zap size={28} />
            <strong>No data yet</strong>
            <p>Run a site audit and connect Search Console to enable diagnosis.</p>
          </div>
        )}

        {hasData && (
          <>
            {findings.length > 0 && (
              <div className="diagnose-section diagnose-findings" style={{ marginTop: "24px" }}>
                <h3>Automatic findings</h3>
                {findings.map((f, i) => (
                  <div key={i} className="diagnose-finding">
                    <div className="diagnose-finding-icon">
                      {f.kind === "drop" ? <TrendingDown size={14} /> : f.kind === "issues" ? <AlertTriangle size={14} /> : <Zap size={14} />}
                    </div>
                    <div className="diagnose-finding-body">
                      <strong>{f.title}</strong>
                      <p>{f.detail}</p>
                    </div>
                  </div>
                ))}
                {findings.length === 0 && <p className="diagnose-empty">No significant drops detected in available history.</p>}
              </div>
            )}

            {findings.length === 0 && hasData && (
              <div className="website-settings-message" style={{ marginTop: "20px" }}>
                No significant drops detected in the available audit and traffic history. Keep running regular audits to build a longer baseline.
              </div>
            )}

            <div className="diagnose-grid">
              {/* Audit score timeline */}
              {audits.length > 0 && (
                <div className="diagnose-section">
                  <h3>Audit score history</h3>
                  <div className="diagnose-timeline">
                    {[...audits].reverse().map((audit, i, arr) => {
                      const score = Number(audit.score ?? 0);
                      const prevScore = i > 0 ? Number(arr[i - 1].score ?? 0) : score;
                      const delta = score - prevScore;
                      return (
                        <div key={String(audit._id)} className="diagnose-row">
                          <span className="diagnose-date">{fmtDate(audit.completedAt)}</span>
                          <div>
                            <div className="diagnose-score-bar">
                              <div className={`diagnose-score-fill ${scoreClass(score)}`} style={{ width: `${score}%` }} />
                            </div>
                          </div>
                          <span className="diagnose-score-num">
                            {score}
                            {i > 0 && (
                              <span className={`diagnose-delta ${delta < -3 ? "is-drop" : delta > 3 ? "is-gain" : ""}`}>
                                {delta > 0 ? ` +${delta.toFixed(0)}` : delta < 0 ? ` ${delta.toFixed(0)}` : ""}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PageSpeed history */}
              {pagespeedResults.length > 0 && (
                <div className="diagnose-section">
                  <h3>PageSpeed history</h3>
                  <div className="diagnose-timeline">
                    {pagespeedResults.map((result) => {
                      const score = Math.round(Number(result.score ?? 0) * 100);
                      return (
                        <div key={String(result._id)} className="diagnose-row">
                          <span className="diagnose-date">{fmtDate(result.retrievedAt)} · {String(result.strategy ?? "")}</span>
                          <div>
                            <div className="diagnose-score-bar">
                              <div className={`diagnose-score-fill ${scoreClass(score)}`} style={{ width: `${score}%` }} />
                            </div>
                          </div>
                          <span className="diagnose-score-num">{score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GSC weekly impressions */}
              {gscConnected && gscWeeks.length > 0 && (
                <div className="diagnose-section">
                  <h3>Weekly impressions (last {gscWeeks.length} weeks)</h3>
                  <div className="diagnose-timeline">
                    {(() => {
                      const maxImp = Math.max(...gscWeeks.map((w) => w.impressions), 1);
                      return gscWeeks.slice(-12).map((week, i, arr) => {
                        const prevImp = i > 0 ? arr[i - 1].impressions : week.impressions;
                        const pctChange = prevImp > 0 ? Math.round(((week.impressions - prevImp) / prevImp) * 100) : 0;
                        const pct = Math.round((week.impressions / maxImp) * 100);
                        return (
                          <div key={week.weekStart} className="diagnose-row">
                            <span className="diagnose-date">{fmtDate(week.weekStart)}</span>
                            <div>
                              <div className="diagnose-score-bar">
                                <div className={`diagnose-score-fill ${pct >= 70 ? "is-good" : pct >= 35 ? "is-warn" : "is-bad"}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <span className="diagnose-score-num">
                              {week.impressions.toLocaleString()}
                              {i > 0 && pctChange !== 0 && (
                                <span className={`diagnose-delta ${pctChange < -15 ? "is-drop" : pctChange > 15 ? "is-gain" : ""}`}>
                                  {pctChange > 0 ? ` +${pctChange}%` : ` ${pctChange}%`}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* New issues detected recently */}
              {newCritical.length > 0 && (
                <div className="diagnose-section">
                  <h3>New issues (last 90 days)</h3>
                  <div>
                    {newCritical.slice(0, 10).map((issue) => (
                      <div key={String(issue._id)} className="diagnose-issue-row">
                        <span className={`diagnose-issue-badge diagnose-issue-${String(issue.severity)}`}>{String(issue.severity)}</span>
                        <span className="diagnose-issue-text">{String(issue.ruleId ?? "").replace(/\./g, " → ")}</span>
                        <span className="diagnose-issue-date">{fmtDate(issue.firstDetectedAt)}</span>
                      </div>
                    ))}
                    {newCritical.length > 10 && (
                      <p style={{ fontSize: "10px", color: "#70675e", marginTop: "6px" }}>+{newCritical.length - 10} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="diagnose-footer">
          <Link href={`/dashboard/websites/${encodeURIComponent(domain)}/action-engine`} className="website-settings-back">
            <Zap size={12} /> Action Engine
          </Link>
          <Link href={`/dashboard/research/${encodeURIComponent(domain)}`} className="website-settings-back">
            Research tools <ChevronRight size={12} />
          </Link>
        </div>
      </section>
    </div>
  );
}
