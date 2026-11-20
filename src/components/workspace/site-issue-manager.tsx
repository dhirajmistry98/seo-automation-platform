"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, RotateCcw, TrendingUp } from "lucide-react";
import { readJson } from "@/lib/read-json";

type RankKeyword = {
  query: string;
  positionBefore: number;
  impressionsBefore: number;
  positionNow: number | null;
  impressionsNow: number | null;
  delta: number | null;
  improved: boolean;
  dropped: boolean;
};

type RankImpact = {
  snapshotDate: string;
  resolvedAt: string;
  pageUrl: string;
  keywords: RankKeyword[];
  checkedAt: string;
};

type SnapshotKeyword = { query: string; position: number; impressions: number };
type RankAtResolution = { snapshotDate: string; keywords: SnapshotKeyword[] };

type Issue = {
  _id: string;
  title: string;
  severity: string;
  status: string;
  pageUrl: string;
  evidence?: string;
  recommendation?: string;
  lastDetectedAt?: string;
  rankAtResolution?: RankAtResolution;
};

function RankImpactPanel({ domain, issue }: { domain: string; issue: Issue }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<RankImpact | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setState("loading");
    setError("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/fix-impact?issueId=${encodeURIComponent(issue._id)}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not fetch rank data.");
      if (data.noSnapshot) { setError(data.message || "No snapshot available."); setState("error"); return; }
      setResult(data as RankImpact);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch rank data.");
      setState("error");
    }
  }

  const snapshot = issue.rankAtResolution;
  if (!snapshot) return null;

  return (
    <div className="rank-impact">
      <div className="rank-impact-header">
        <strong><TrendingUp size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Rank tracking · snapshot {snapshot.snapshotDate}</strong>
        {state !== "done" && (
          <button className="rank-impact-btn" type="button" onClick={check} disabled={state === "loading"}>
            {state === "loading" ? "Checking…" : "Check rank now"}
          </button>
        )}
        {state === "done" && result && (
          <small>checked {new Date(result.checkedAt).toLocaleString()}</small>
        )}
      </div>

      {state === "error" && <p className="rank-impact-error">{error}</p>}

      {state === "done" && result && (
        result.keywords.length === 0 ? (
          <p className="rank-impact-none">No ranking data for this page in the last 28 days.</p>
        ) : (
          <table className="rank-impact-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Before fix</th>
                <th>Now</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {result.keywords.map((kw) => (
                <tr key={kw.query}>
                  <td>{kw.query}</td>
                  <td>#{kw.positionBefore}</td>
                  <td>{kw.positionNow !== null ? `#${kw.positionNow}` : "not ranked"}</td>
                  <td>
                    {kw.delta !== null ? (
                      <span className={`rank-impact-delta ${kw.improved ? "is-improved" : kw.dropped ? "is-dropped" : ""}`}>
                        {kw.improved ? `↑ ${kw.delta.toFixed(1)} places` : kw.dropped ? `↓ ${Math.abs(kw.delta).toFixed(1)} places` : "unchanged"}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

export function SiteIssueManager({ domain, canManage }: { domain: string; canManage: boolean }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [issueNote, setIssueNote] = useState<{ id: string; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not load audit issues.");
    setIssues(data.issues || []);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not load audit issues.");
        if (active) setIssues(data.issues || []);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load audit issues."); });
    return () => { active = false; };
  }, [domain]);

  async function change(issue: Issue, action: "resolve" | "ignore" | "reopen") {
    setBusyId(issue._id);
    setMessage("");
    setIssueNote(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue._id, action }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not update issue.");
      setMessage(
        action === "resolve"
          ? (data.verifiedByAuditId === "live-check"
            ? `Resolved: "${issue.title}" is no longer present on the live page.`
            : `Resolved: "${issue.title}" was not found in the latest audit.`)
          : `Issue marked ${action === "ignore" ? "ignored" : "open"}.`
      );
      await load();
    } catch (error) {
      setIssueNote({ id: issue._id, text: error instanceof Error ? error.message : "Could not update issue." });
    } finally {
      setBusyId("");
    }
  }

  const open = issues.filter((issue) => issue.status === "open");
  const ordered = [...open, ...issues.filter((issue) => issue.status !== "open")];

  return (
    <details className="site-issue-manager">
      <summary>
        <AlertTriangle size={14} /> Audit issues{" "}
        <span>{open.length} open · {issues.filter((i) => i.status === "resolved").length} resolved · {issues.length} total</span>
      </summary>
      <div className="site-issue-content">
        {!issues.length ? (
          <p className="site-control-message">Run an audit to populate findings.</p>
        ) : (
          <div className="site-issue-list">
            {ordered.slice(0, 100).map((issue) => (
              <article key={issue._id}>
                <div className="site-issue-main">
                  <span className={`site-issue-severity is-${issue.severity}`}>{issue.severity}</span>
                  {issue.status !== "open" && (
                    <span className={`site-issue-state is-${issue.status}`}>{issue.status === "resolved" ? "Resolved" : "Ignored"}</span>
                  )}
                  <strong>{issue.title}</strong>
                  <a href={issue.pageUrl} target="_blank" rel="noreferrer">{issue.pageUrl}</a>
                  {issue.evidence && <p>Evidence: {issue.evidence}</p>}
                  {issue.recommendation && <p>{issue.recommendation}</p>}
                  {issueNote?.id === issue._id && <p className="site-issue-note" role="alert">{issueNote.text}</p>}
                  {issue.status === "resolved" && <RankImpactPanel domain={domain} issue={issue} />}
                </div>
                {canManage ? (
                  <div className="site-issue-actions">
                    {issue.status === "open" ? (
                      <>
                        <button type="button" disabled={busyId === issue._id} onClick={() => change(issue, "resolve")}>
                          <CheckCircle2 size={12} /> {busyId === issue._id ? "Checking live page…" : "Verify resolved"}
                        </button>
                        <button type="button" disabled={busyId === issue._id} onClick={() => change(issue, "ignore")}>
                          <CircleOff size={12} /> Ignore
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={busyId === issue._id} onClick={() => change(issue, "reopen")}>
                        <RotateCcw size={12} /> Reopen
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="org-role-label">{issue.status}</span>
                )}
              </article>
            ))}
          </div>
        )}
        {message && <p className="site-control-message" role="status">{message}</p>}
      </div>
    </details>
  );
}
