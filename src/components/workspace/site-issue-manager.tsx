"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, RotateCcw, TrendingUp, Wrench } from "lucide-react";
import { readJson } from "@/lib/read-json";
import { WorkspaceActionDialog } from "./workspace-action-dialog";

// ── Types ────────────────────────────────────────────────────────────────────

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
type RankImpact = { snapshotDate: string; resolvedAt: string; pageUrl: string; keywords: RankKeyword[]; checkedAt: string };
type SnapshotKeyword = { query: string; position: number; impressions: number };
type RankAtResolution = { snapshotDate: string; keywords: SnapshotKeyword[] };

type Issue = {
  _id: string;
  title: string;
  ruleId?: string;
  severity: string;
  status: string;
  pageUrl: string;
  evidence?: string;
  recommendation?: string;
  lastDetectedAt?: string;
  rankAtResolution?: RankAtResolution;
};

type WpPost = { wordpressPostId: number; url: string; title: string; meta?: Record<string, string> };

// ── WordPress fix config ──────────────────────────────────────────────────────

type WpField = "title" | "description" | "canonical" | "robots";
type WpFixSpec = { field: WpField; label: string; placeholder: string; defaultValue?: (url: string) => string; maxLength: number; rows: number };

const WP_FIXABLE: Partial<Record<string, WpFixSpec>> = {
  "metadata.title_missing":        { field: "title",       label: "SEO title",          placeholder: "Enter a descriptive SEO title",           maxLength: 300, rows: 2 },
  "metadata.description_missing":  { field: "description", label: "Meta description",   placeholder: "Write a 150–160 character description",   maxLength: 500, rows: 3 },
  "canonical.missing":             { field: "canonical",   label: "Canonical URL",       placeholder: "", defaultValue: (url) => url,            maxLength: 2048, rows: 2 },
  "canonical.incorrect":           { field: "canonical",   label: "Canonical URL",       placeholder: "Enter the correct canonical URL",         maxLength: 2048, rows: 2 },
  "robots.blocked":                { field: "robots",      label: "Robots directives",  placeholder: "index, follow", defaultValue: () => "index, follow", maxLength: 100, rows: 2 },
};

// ── Rank impact panel (post-fix rank tracking) ────────────────────────────────

function RankImpactPanel({ domain, issue }: { domain: string; issue: Issue }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<RankImpact | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setState("loading"); setError("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/fix-impact?issueId=${encodeURIComponent(issue._id)}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not fetch rank data.");
      if (data.noSnapshot) { setError(data.message || "No snapshot available."); setState("error"); return; }
      setResult(data as RankImpact);
      setState("done");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not fetch rank data."); setState("error"); }
  }

  const snapshot = issue.rankAtResolution;
  if (!snapshot) return null;

  return (
    <div className="rank-impact">
      <div className="rank-impact-header">
        <strong><TrendingUp size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Rank tracking · snapshot {snapshot.snapshotDate}</strong>
        {state !== "done" && <button className="rank-impact-btn" type="button" onClick={check} disabled={state === "loading"}>{state === "loading" ? "Checking…" : "Check rank now"}</button>}
        {state === "done" && result && <small>checked {new Date(result.checkedAt).toLocaleString()}</small>}
      </div>
      {state === "error" && <p className="rank-impact-error">{error}</p>}
      {state === "done" && result && (
        result.keywords.length === 0 ? (
          <p className="rank-impact-none">No ranking data for this page in the last 28 days.</p>
        ) : (
          <table className="rank-impact-table">
            <thead><tr><th>Keyword</th><th>Before fix</th><th>Now</th><th>Change</th></tr></thead>
            <tbody>
              {result.keywords.map((kw) => (
                <tr key={kw.query}>
                  <td>{kw.query}</td>
                  <td>#{kw.positionBefore}</td>
                  <td>{kw.positionNow !== null ? `#${kw.positionNow}` : "not ranked"}</td>
                  <td>{kw.delta !== null ? (
                    <span className={`rank-impact-delta ${kw.improved ? "is-improved" : kw.dropped ? "is-dropped" : ""}`}>
                      {kw.improved ? `↑ ${kw.delta.toFixed(1)} places` : kw.dropped ? `↓ ${Math.abs(kw.delta).toFixed(1)} places` : "unchanged"}
                    </span>
                  ) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ── WordPress fix panel ───────────────────────────────────────────────────────

type WpFixPanelProps = {
  domain: string;
  issue: Issue;
  wpPost: WpPost | undefined;
  onResolved: () => void;
};

function WpFixPanel({ domain, issue, wpPost, onResolved }: WpFixPanelProps) {
  const spec = WP_FIXABLE[issue.ruleId ?? ""];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");

  if (!spec || !wpPost || issue.status !== "open") return null;

  function startFix() {
    const current = wpPost?.meta?.[spec!.field] ?? "";
    const suggested = spec!.defaultValue ? spec!.defaultValue(issue.pageUrl) : current;
    setValue(suggested);
    setMessage("");
    setOpen(true);
  }

  async function applyAndVerify() {
    // 1. Push to WordPress
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/wordpress-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: wpPost!.wordpressPostId, metadata: { [spec!.field]: value }, approved: true }),
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "WordPress update failed.");

    // 2. Verify the issue is resolved on the live page
    setVerifying(true);
    try {
      const verifyResponse = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue._id, action: "resolve" }),
      });
      const verifyData = await readJson(verifyResponse);
      if (!verifyResponse.ok) {
        // Fix was applied to WP but live-check failed — not an error, just a timing issue
        setMessage(`Applied to WordPress. ${verifyData.error || "Re-verify after WordPress caches clear."}`);
      } else {
        onResolved();
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      {!open && (
        <button className="wp-fix-btn" type="button" onClick={startFix}>
          <Wrench size={11} /> Fix in WordPress
        </button>
      )}

      {open && (
        <div className="wp-fix-panel">
          <div className="wp-fix-panel-header">
            <strong><Wrench size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />{spec.label} for &ldquo;{wpPost.title}&rdquo;</strong>
            <button type="button" className="wp-fix-cancel" onClick={() => setOpen(false)}>✕</button>
          </div>
          {wpPost.meta?.[spec.field] && (
            <p className="wp-fix-current">Current: {wpPost.meta[spec.field]}</p>
          )}
          <textarea
            className="wp-fix-textarea"
            rows={spec.rows}
            maxLength={spec.maxLength}
            placeholder={spec.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="wp-fix-actions">
            <button type="button" className="wp-fix-apply" disabled={!value.trim()} onClick={() => setConfirmOpen(true)}>
              Apply to WordPress
            </button>
            <span className="wp-fix-hint">{value.length} / {spec.maxLength}</span>
          </div>
          {message && <p className="site-issue-note" role="status">{message}</p>}
        </div>
      )}

      <WorkspaceActionDialog
        open={confirmOpen}
        eyebrow="WORDPRESS LIVE UPDATE"
        title={`Update ${spec.label}`}
        description={`This will write the new ${spec.label.toLowerCase()} directly to "${wpPost.title}" on your connected WordPress site, then verify the SEO issue is resolved.`}
        details={[{ label: spec.label, before: wpPost.meta?.[spec.field] || "(empty)", after: value }]}
        confirmLabel={verifying ? "Verifying…" : "Apply & verify"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={applyAndVerify}
      />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SiteIssueManager({ domain, canManage }: { domain: string; canManage: boolean }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [wpPosts, setWpPosts] = useState<Map<string, WpPost>>(new Map());
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [issueNote, setIssueNote] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "Could not load audit issues.");
    setIssues(data.issues || []);
  }, [domain]);

  useEffect(() => {
    let active = true;
    // Load issues and WP posts in parallel
    Promise.all([
      fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" }).then((r) => readJson(r)),
      fetch(`/api/sites/${encodeURIComponent(domain)}/wordpress-content`, { cache: "no-store" }).then((r) => r.ok ? readJson(r) : { posts: [] }),
    ]).then(([issuesData, wpData]) => {
      if (!active) return;
      setIssues(issuesData.issues || []);
      const postMap = new Map<string, WpPost>();
      for (const post of (wpData.posts as WpPost[] || [])) {
        // Normalise URL: strip trailing slash for matching
        const key = String(post.url).replace(/\/$/, "").toLowerCase();
        postMap.set(key, post);
      }
      setWpPosts(postMap);
    }).catch((err) => { if (active) setMessage(err instanceof Error ? err.message : "Could not load issues."); });
    return () => { active = false; };
  }, [domain]);

  async function change(issue: Issue, action: "resolve" | "ignore" | "reopen") {
    setBusyId(issue._id); setMessage(""); setIssueNote(null);
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
    } finally { setBusyId(""); }
  }

  function wpPostForIssue(issue: Issue): WpPost | undefined {
    const key = String(issue.pageUrl).replace(/\/$/, "").toLowerCase();
    return wpPosts.get(key);
  }

  const open = issues.filter((i) => i.status === "open");
  const ordered = [...open, ...issues.filter((i) => i.status !== "open")];

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
                  {issue.status === "open" && canManage && (
                    <WpFixPanel
                      domain={domain}
                      issue={issue}
                      wpPost={wpPostForIssue(issue)}
                      onResolved={load}
                    />
                  )}
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
