"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { CrawlJob } from "@/components/workspace/site-audit-controls";

const STEPS = [
  { key: "queued", label: "Starting" },
  { key: "running", label: "Scanning pages" },
  { key: "saving", label: "Saving results" },
] as const;

function stepIndex(status: string) {
  if (status === "saving") return 2;
  if (status === "running" || status === "cancel_requested") return 1;
  return 0;
}

function elapsedLabel(from: string | Date | undefined, now: number) {
  const started = from ? new Date(from).getTime() : NaN;
  if (!Number.isFinite(started)) return "";
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Live crawl status: which step is running, page progress, elapsed time, and what happens next. */
export function CrawlProgressPanel({ job, onCancel }: { job: CrawlJob; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = job.progress;
  const scanned = progress?.pagesScanned ?? 0;
  const maxPages = Math.max(1, progress?.maxPages ?? 1);
  // Never show 100 % before saving finishes; the crawl can also stop early when a site has fewer pages than the cap.
  const percent = job.status === "saving" ? 100 : Math.min(95, Math.round((scanned / maxPages) * 100));
  const indeterminate = job.status === "queued" || job.status === "retrying" || (job.status === "running" && scanned === 0) || job.status === "saving";
  const current = stepIndex(job.status);
  const elapsed = elapsedLabel(job.createdAt, now);
  const waitingLong = job.status === "queued" && job.createdAt && now - new Date(job.createdAt).getTime() > 45_000;
  const retryAt = job.nextAttemptAt ? new Date(job.nextAttemptAt) : null;

  const headline = {
    queued: "Starting the crawler…",
    running: scanned ? `Scanning pages · ${scanned} of up to ${maxPages}` : "Fetching your homepage, robots.txt and sitemap…",
    saving: "Saving results and building your SEO report…",
    retrying: `The crawl hit a problem. Retrying${retryAt ? ` at ${retryAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " shortly"}${job.attemptCount ? ` (attempt ${job.attemptCount + 1} of 3)` : ""}.`,
    cancel_requested: "Stopping the crawl…",
  }[job.status] ?? "Working…";

  return (
    <div className="crawl-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="crawl-progress-head">
        <LoaderCircle size={16} className="crawl-progress-spinner" aria-hidden="true" />
        <strong>{headline}</strong>
        {elapsed && <span className="crawl-progress-elapsed" aria-label={`Elapsed ${elapsed}`}>{elapsed}</span>}
      </div>

      <ol className="crawl-progress-steps" aria-label="Crawl steps">
        {STEPS.map((step, index) => {
          const state = index < current ? "done" : index === current ? "active" : "todo";
          return (
            <li key={step.key} className={`is-${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="crawl-progress-step-mark">{state === "done" ? <Check size={11} aria-hidden="true" /> : index + 1}</span>
              {step.label}
            </li>
          );
        })}
      </ol>

      <div
        className={`crawl-progress-bar${indeterminate ? " is-indeterminate" : ""}`}
        role="progressbar"
        aria-label="Crawl progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        <span style={indeterminate ? undefined : { width: `${percent}%` }} />
      </div>

      <div className="crawl-progress-foot">
        <span>
          {scanned} scanned · {progress?.pagesAttempted ?? 0} attempted · {progress?.pagesQueued ?? 0} waiting · {progress?.failedPages ?? 0} failed
        </span>
        <button type="button" onClick={onCancel} disabled={job.status === "saving" || job.status === "cancel_requested"} data-no-loader>
          Cancel crawl
        </button>
      </div>

      <p className="crawl-progress-note">
        {waitingLong
          ? "Waiting for a free crawl slot. Many audits are running right now; yours starts automatically and you can leave this page."
          : "Usually takes 1–3 minutes. You can leave this page; the crawl keeps running and results are saved."}
      </p>
    </div>
  );
}
