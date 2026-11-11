"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, RotateCcw } from "lucide-react";

type Issue = { _id: string; title: string; severity: string; status: string; pageUrl: string; evidence?: string; recommendation?: string; lastDetectedAt?: string };
export function SiteIssueManager({ domain, canManage }: { domain: string; canManage: boolean }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  async function load() {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load audit issues.");
    setIssues(data.issues || []);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load audit issues.");
        if (active) setIssues(data.issues || []);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load audit issues."); });
    return () => { active = false; };
  }, [domain]);
  async function change(issue: Issue, action: "resolve" | "ignore" | "reopen") {
    setBusyId(issue._id); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/issues`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId: issue._id, action }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update issue.");
      setMessage(action === "resolve" ? `Issue verified absent in audit ${data.verifiedByAuditId}.` : `Issue marked ${action === "ignore" ? "ignored" : "open"}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update issue."); } finally { setBusyId(""); }
  }
  const open = issues.filter((issue) => issue.status === "open");
  return <details className="site-issue-manager"><summary><AlertTriangle size={14} /> Audit issues <span>{open.length} open · {issues.length} total</span></summary><div className="site-issue-content">
    {!issues.length ? <p className="site-control-message">Run an audit to populate findings.</p> : <div className="site-issue-list">{issues.slice(0,100).map((issue) => <article key={issue._id}><div className="site-issue-main"><span className={`site-issue-severity is-${issue.severity}`}>{issue.severity}</span><strong>{issue.title}</strong><a href={issue.pageUrl} target="_blank" rel="noreferrer">{issue.pageUrl}</a>{issue.evidence && <p>Evidence: {issue.evidence}</p>}{issue.recommendation && <p>{issue.recommendation}</p>}</div>{canManage ? <div className="site-issue-actions">{issue.status === "open" ? <><button type="button" disabled={busyId === issue._id} onClick={() => change(issue,"resolve")}><CheckCircle2 size={12} /> Verify resolved</button><button type="button" disabled={busyId === issue._id} onClick={() => change(issue,"ignore")}><CircleOff size={12} /> Ignore</button></> : <button type="button" disabled={busyId === issue._id} onClick={() => change(issue,"reopen")}><RotateCcw size={12} /> Reopen</button>}</div> : <span className="org-role-label">{issue.status}</span>}</article>)}</div>}
    {message && <p className="site-control-message" role="status">{message}</p>}
  </div></details>;
}
