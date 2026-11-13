"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileSearch, Gauge, ListTodo, LoaderCircle, ShieldCheck } from "lucide-react";
import { CrawlProgressPanel } from "@/components/workspace/crawl-progress-panel";
import { readJson } from "@/lib/read-json";

type Verification = { token: string; verified: boolean; method?: string | null; recordName: string; recordValue: string; htmlMetaName: string; htmlMetaContent: string; htmlMetaTag: string };
export type AuditSummary = { auditId: string; score: number; confidence: number; pageCount: number; issueCounts: { critical: number; warning: number; notice: number }; confidenceNote: string };
type SeoTask = { _id: string; title: string; description: string; severity: string; status: "todo" | "in_progress" | "done"; pageUrl: string; assigneeId: string; dueDate: string; comments: Array<{ userId: string; text: string; createdAt: string }> };
type TaskMember = { id: string; label: string };
type PageSpeedResult = { categories: Record<string, number | null>; strategy: string; url: string; labMetrics: Record<string, { displayValue: string | null }>; fieldMetrics: Record<string, { category?: string; percentile?: number }> | null; fieldDataStatus: string; opportunities: Array<{ id: string; title: string; displayValue: string | null; savingsMs: number | null }> };
export type CrawlJob = { jobId: string; auditId: string; status: string; createdAt?: string | Date; lastAttemptAt?: string | Date; nextAttemptAt?: string | Date; attemptCount?: number; error?: string; progress?: { pagesScanned: number; pagesAttempted: number; pagesQueued: number; failedPages: number; maxPages: number }; summary?: AuditSummary | null };

export function SiteAuditControls({ domain, siteUrl, verifiedAt, lastAudit, canManageSite, canManageTasks, canRunAudit }: { domain: string; siteUrl: string; verifiedAt?: string | Date | null; lastAudit?: AuditSummary | null; canManageSite: boolean; canManageTasks: boolean; canRunAudit: boolean }) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verified, setVerified] = useState(Boolean(verifiedAt));
  const [verificationMethod, setVerificationMethod] = useState<"dns_txt" | "html_meta">("dns_txt");
  const [summary, setSummary] = useState<AuditSummary | null>(lastAudit ?? null);
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [recentCrawls, setRecentCrawls] = useState<CrawlJob[]>([]);
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [taskMembers, setTaskMembers] = useState<TaskMember[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [pageSpeed, setPageSpeed] = useState<PageSpeedResult | null>(null);
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState<"verify" | "audit" | "pagespeed" | "tasks" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${encodeURIComponent(domain)}/verify`, { cache: "no-store" })
      .then(async (response) => response.ok ? readJson(response) as Promise<Verification> : null)
      .then((data) => { if (!cancelled && data) { setVerification(data); setVerified(data.verified); } })
      .catch(() => { if (!cancelled) setMessage("Verification instructions could not be loaded."); });
    fetch(`/api/sites/${encodeURIComponent(domain)}/pagespeed`, { cache: "no-store" })
      .then(async (response) => response.ok ? readJson(response) : null)
      .then((data) => { if (!cancelled && data?.reports?.[0]) setPageSpeed(data.reports[0]); })
      .catch(() => undefined);
    fetch(`/api/sites/${encodeURIComponent(domain)}/crawl-jobs`, { cache: "no-store" })
      .then(async (response) => response.ok ? readJson(response) as Promise<{ activeJob: CrawlJob | null; jobs: CrawlJob[] }> : null)
      .then((data) => { if (!cancelled && data) { setRecentCrawls(data.jobs || []); if (data.activeJob) setCrawlJob(data.activeJob); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [domain]);

  useEffect(() => {
    if (!crawlJob?.jobId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/crawl-jobs?jobId=${encodeURIComponent(crawlJob.jobId)}`, { cache: "no-store" });
        const data = await readJson(response) as CrawlJob & { error?: string };
        if (!response.ok) throw new Error(data.error || "Crawl status could not be loaded.");
        if (stopped) return;
        if (data.status === "completed") {
          if (data.summary) setSummary(data.summary);
          setMessage(`Audit complete · ${data.summary?.pageCount ?? data.progress?.pagesScanned ?? 0} pages scanned.`);
          setCrawlJob(null);
          setTasksOpen(true);
          void fetch(`/api/sites/${encodeURIComponent(domain)}/tasks`, { cache: "no-store" }).then(async (response) => response.ok ? readJson(response) as Promise<{ tasks: SeoTask[]; members?: TaskMember[] }> : null).then((taskData) => { if (!stopped && taskData) { setTasks(taskData.tasks || []); setTaskMembers(taskData.members || []); } }).catch(() => undefined);
          void fetch(`/api/sites/${encodeURIComponent(domain)}/crawl-jobs`, { cache: "no-store" }).then((response) => response.ok ? readJson(response) : null).then((history) => { if (!stopped && history) setRecentCrawls(history.jobs || []); }).catch(() => undefined);
        } else if (["failed", "cancelled"].includes(data.status)) {
          setMessage(data.status === "cancelled" ? "Crawl cancelled safely." : "Crawl failed after its retry limit. Open crawl history for details.");
          setCrawlJob(null);
        } else setCrawlJob(data);
      } catch (error) {
        if (!stopped) setMessage(error instanceof Error ? error.message : "Crawl status could not be loaded.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [crawlJob?.jobId, domain]);

  async function verify() {
    setBusy("verify"); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: verificationMethod }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not verify this domain.");
      setVerified(true); setMessage(verificationMethod === "dns_txt" ? "Domain ownership verified with DNS TXT." : "Domain ownership verified with the homepage meta tag.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed."); }
    finally { setBusy(null); }
  }

  async function audit() {
    setBusy("audit"); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/crawl-jobs`, { method: "POST" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "The crawl could not be queued.");
      setCrawlJob(data); setMessage(data.status === "queued" ? "" : "A crawl is already running for this website. Showing its progress.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audit failed."); }
    finally { setBusy(null); }
  }

  async function cancelCrawl() {
    if (!crawlJob) return;
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/crawl-jobs?jobId=${encodeURIComponent(crawlJob.jobId)}`, { method: "DELETE" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "The crawl could not be cancelled.");
      setCrawlJob({ ...crawlJob, status: data.status });
      setMessage(data.status === "cancelled" ? "Queued crawl cancelled." : "Cancellation requested. The worker will stop safely after the current page.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The crawl could not be cancelled."); }
  }

  async function loadTasks() {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/tasks`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error ?? "Could not load tasks.");
    setTasks(data.tasks); setTaskMembers(data.members || []);
  }

  async function generateTasks() {
    if (!summary) return;
    setBusy("tasks"); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId: summary.auditId }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not generate tasks.");
      await loadTasks(); setTasksOpen(true); setMessage(`${data.created} task${data.created === 1 ? "" : "s"} added, ${data.reopened} reopened.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create tasks."); }
    finally { setBusy(null); }
  }

  async function updateTask(taskId: string, update: Partial<Pick<SeoTask, "status" | "assigneeId" | "dueDate">>) {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/tasks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, ...update }) });
    const data = await readJson(response);
    if (!response.ok) { setMessage(data.error ?? "Could not update task."); return; }
    setTasks((current) => current.map((task) => task._id === taskId ? { ...task, ...update } : task));
    setMessage("Task updated.");
  }

  async function addTaskComment(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const comment = String(formData.get("comment") || "");
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", taskId, comment }) });
    const data = await readJson(response);
    if (!response.ok) { setMessage(data.error ?? "Could not add comment."); return; }
    form.reset(); await loadTasks(); setMessage("Comment added to the task.");
  }

  async function runPageSpeed() {
    setBusy("pagespeed"); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/pagespeed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteUrl, strategy: pageSpeedStrategy }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "PageSpeed request failed.");
      setPageSpeed(data); setMessage("PageSpeed data retrieved from Google.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "PageSpeed request failed."); }
    finally { setBusy(null); }
  }

  return <div className="site-audit-controls">
    {!verified ? canManageSite ? <div className="site-verification-box">
      <div className="site-control-heading"><ShieldCheck size={15} /><strong>Verify ownership to enable a site crawl</strong></div>
      <div className="site-verification-methods" role="group" aria-label="Verification method"><button type="button" className={verificationMethod === "dns_txt" ? "is-current" : ""} onClick={() => setVerificationMethod("dns_txt")}>DNS TXT</button><button type="button" className={verificationMethod === "html_meta" ? "is-current" : ""} onClick={() => setVerificationMethod("html_meta")}>HTML meta tag</button></div>
      {verificationMethod === "dns_txt" ? <><p>Add this TXT record to your domain’s DNS. Verification can take a few minutes to propagate.</p><dl><div><dt>Record name</dt><dd>{verification?.recordName ?? `_seo-studio.${domain}`}</dd></div><div><dt>TXT value</dt><dd>{verification?.recordValue ?? "Loading verification token…"}</dd></div></dl></> : <><p>Place this exact tag inside the <code>&lt;head&gt;</code> of your website homepage, then verify it here.</p><dl><div><dt>Homepage tag</dt><dd>{verification?.htmlMetaTag ?? "Loading verification token…"}</dd></div></dl></>}
      <button type="button" onClick={verify} disabled={busy !== null || !verification}><CheckCircle2 size={14} />{busy === "verify" ? "Checking website…" : `Verify ${verificationMethod === "dns_txt" ? "DNS record" : "HTML meta tag"}`}</button>
    </div> : <div className="site-verification-box"><p>Ask a workspace administrator to verify this website before crawling.</p></div> : <div className="site-audit-box">
      <span><CheckCircle2 size={15} /> Ownership verified</span>
      <div>{canRunAudit && <button type="button" onClick={audit} disabled={busy !== null || Boolean(crawlJob)}>{busy === "audit" ? <><LoaderCircle className="site-spin" size={14} aria-hidden="true" /> Queueing…</> : <><FileSearch size={14} aria-hidden="true" /> {crawlJob ? "Crawl in progress" : "Run site audit"}</>}</button>}{canRunAudit && <label className="site-pagespeed-select"><span>PageSpeed device</span><select value={pageSpeedStrategy} onChange={(event) => setPageSpeedStrategy(event.target.value as "mobile" | "desktop")}><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select></label>}{canRunAudit && <button type="button" onClick={runPageSpeed} disabled={busy !== null || Boolean(crawlJob)}>{busy === "pagespeed" ? <><LoaderCircle className="site-spin" size={14} aria-hidden="true" /> Running PageSpeed…</> : <><Gauge size={14} aria-hidden="true" /> Run PageSpeed</>}</button>}</div>
    </div>}
    {crawlJob && <CrawlProgressPanel job={crawlJob} onCancel={cancelCrawl} />}
    {recentCrawls.length > 0 && <div className="site-crawl-history"><strong>Recent crawls</strong>{recentCrawls.map((job) => <div key={job.jobId}><span>{job.createdAt ? new Date(job.createdAt).toLocaleString() : "Crawl"}</span><span className={`site-crawl-status status-${job.status}`}>{job.status.replaceAll("_", " ")}</span><span>{job.summary ? `${job.summary.pageCount} pages · SEO Health ${job.summary.score}` : job.error || `${job.progress?.pagesScanned ?? 0} pages scanned`}</span></div>)}</div>}
    {summary && <div className="site-audit-result"><strong>SEO Health {summary.score}<small>/100</small></strong><span>{summary.pageCount} pages · {summary.issueCounts.critical} critical · {summary.issueCounts.warning} warnings · {summary.issueCounts.notice} notices</span><small>{summary.confidence}% data confidence · {summary.confidenceNote}</small>{canManageTasks && <button type="button" onClick={generateTasks} disabled={busy !== null || tasks.length > 0}>{busy === "tasks" ? <><LoaderCircle className="site-spin" size={13} aria-hidden="true" /> Creating plan…</> : <><ListTodo size={13} aria-hidden="true" /> {tasks.length ? "SEO action plan generated" : "Create SEO action plan"}</>}</button>}</div>}
    {tasksOpen && <div className="site-task-list" aria-label="SEO action plan">{tasks.length ? tasks.map((task) => <article key={task._id}><div className="site-task-main"><strong>{task.title}</strong><p>{task.description}</p><a href={task.pageUrl} target="_blank" rel="noreferrer">{task.pageUrl}</a><div className="site-task-meta"><label>Assignee<select aria-label={`Assignee for ${task.title}`} disabled={!canManageTasks} value={task.assigneeId || ""} onChange={(event) => updateTask(task._id, { assigneeId: event.target.value })}><option value="">Unassigned</option>{taskMembers.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label><label>Due date<input aria-label={`Due date for ${task.title}`} type="date" disabled={!canManageTasks} value={task.dueDate || ""} onChange={(event) => updateTask(task._id, { dueDate: event.target.value })} /></label><select aria-label={`Status for ${task.title}`} disabled={!canManageTasks} value={task.status} onChange={(event) => updateTask(task._id, { status: event.target.value as SeoTask["status"] })}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div><details className="site-task-discussion"><summary>Discussion · {task.comments?.length || 0}</summary><div>{(task.comments || []).map((comment, index) => <p key={`${comment.createdAt}-${index}`}><span>{taskMembers.find((member) => member.id === comment.userId)?.label || "Workspace member"} · {new Date(comment.createdAt).toLocaleString()}</span>{comment.text}</p>)}{canManageTasks ? <form onSubmit={(event) => addTaskComment(task._id, event)}><textarea name="comment" aria-label={`Comment on ${task.title}`} maxLength={2000} required placeholder="Add a task comment…" /><button type="submit">Add comment</button></form> : <small>Comments are available to members who can manage tasks.</small>}</div></details></div></article>) : <p>No tasks yet. Generate an action plan from audit findings.</p>}</div>}
    {!tasksOpen && <button type="button" className="site-task-toggle" onClick={() => { setTasksOpen(true); loadTasks().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load tasks.")); }}><ListTodo size={13} /> View SEO tasks</button>}
    {pageSpeed && <div className="site-pagespeed-result"><strong>Google PageSpeed · {pageSpeed.strategy}</strong><div>{Object.entries(pageSpeed.categories).map(([key, value]) => <span key={key}>{key.replaceAll("-", " ")} <b>{value === null ? "—" : value}</b></span>)}</div><p>Lab data</p><ul>{Object.entries(pageSpeed.labMetrics).map(([key, value]) => <li key={key}>{key.replaceAll("-", " ")}: {value.displayValue ?? "No display value"}</li>)}</ul><p>Field data: {pageSpeed.fieldDataStatus === "available" ? "Available from the provider" : "Not returned by the provider for this page"}</p>{pageSpeed.fieldMetrics && <ul>{Object.entries(pageSpeed.fieldMetrics).map(([key, value]) => <li key={key}>{key.replaceAll("_", " ")}: {value.percentile ?? "—"} {value.category ? `(${value.category})` : ""}</li>)}</ul>}<strong>Optimization opportunities</strong><ul>{pageSpeed.opportunities.slice(0, 4).map((item) => <li key={item.id}>{item.title}{item.displayValue ? ` · ${item.displayValue}` : ""}</li>)}</ul></div>}
    {message && <p className="site-control-message" role="status">{message}</p>}
  </div>;
}
