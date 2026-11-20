"use client";

import { KeyRound, LoaderCircle, RotateCw, ShieldAlert, Wallet } from "lucide-react";

export type ProviderIssue = {
  state: "unverified" | "bad_credentials" | "no_balance" | "rate_limited" | "unavailable";
  message?: string;
  actionUrl: string;
};

/** Issues that make every report fail until the account owner fixes something in the data provider account. */
export function isBlockingIssue(issue: ProviderIssue | null): issue is ProviderIssue {
  return Boolean(issue && (issue.state === "unverified" || issue.state === "bad_credentials" || issue.state === "no_balance"));
}

const COPY: Record<ProviderIssue["state"], { title: string; body: string; steps: string[]; action: string }> = {
  unverified: {
    title: "Verify your data provider account",
    body: "The configured data provider blocks requests until the account is verified.",
    steps: [
      "Open the provider dashboard and sign in.",
      "Follow the verification prompt (email, phone, or billing details).",
      "Make sure the account has a balance, then come back and select Check again.",
    ],
    action: "Open provider dashboard",
  },
  no_balance: {
    title: "Add balance to your data provider",
    body: "Each report uses a small amount of provider credit, and the account balance is empty.",
    steps: ["Open the provider dashboard.", "Add funds under Payments.", "Come back and select Check again."],
    action: "Open provider dashboard",
  },
  bad_credentials: {
    title: "Data provider login rejected",
    body: "The API login or password saved on the server is wrong.",
    steps: [
      "Open API Access in the provider dashboard and copy the API login and password.",
      "Update DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in your server environment and redeploy.",
    ],
    action: "Open provider API access",
  },
  rate_limited: {
    title: "Data provider is busy",
    body: "Too many requests were sent in a short time. Wait a minute, then run the report again.",
    steps: [],
    action: "Open provider dashboard",
  },
  unavailable: {
    title: "Data provider could not be reached",
    body: "This is usually temporary. Try again in a moment.",
    steps: [],
    action: "Open provider dashboard",
  },
};

export function providerActionLabel(issue: ProviderIssue) {
  return COPY[issue.state].action;
}

export function ProviderAccountAlert({ issue, checking, onRecheck }: { issue: ProviderIssue; checking: boolean; onRecheck: () => void }) {
  const copy = COPY[issue.state];
  const Icon = issue.state === "no_balance" ? Wallet : issue.state === "bad_credentials" ? KeyRound : ShieldAlert;
  return (
    <div className={`provider-alert${isBlockingIssue(issue) ? " is-blocking" : ""}`} role="alert">
      <div className="provider-alert-head">
        <span className="provider-alert-icon"><Icon size={17} aria-hidden="true" /></span>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
        </div>
      </div>
      {copy.steps.length > 0 && (
        <ol className="provider-alert-steps">
          {copy.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}
      <div className="provider-alert-actions">
        <a className="provider-alert-primary" href={issue.actionUrl} target="_blank" rel="noreferrer">
          {copy.action}
        </a>
        <button type="button" className="provider-alert-secondary" onClick={onRecheck} disabled={checking} data-no-loader>
          {checking ? <LoaderCircle size={14} className="research-spinner" aria-hidden="true" /> : <RotateCw size={14} aria-hidden="true" />}
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
    </div>
  );
}
