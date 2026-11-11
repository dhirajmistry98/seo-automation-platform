"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";

export function EmailOtpForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestCode() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/email-otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setError(result.message || "We could not send a sign-in code.");
        return;
      }
      setSent(true);
      setMessage(result.message || "Check your inbox for a sign-in code.");
    } catch {
      setError("We could not reach the sign-in service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn("email-otp", {
        email,
        code,
        mfaCode,
        redirect: false,
        redirectTo,
      });
      if (!result?.ok || !result.url) {
        setError("The email code or authenticator code is invalid. Check both codes and try again.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("We could not complete sign-in. Please request a new code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="otp-panel" aria-labelledby="email-sign-in-title">
      <div className="otp-heading">
        <span className="otp-icon"><Mail size={16} /></span>
        <div>
          <h2 id="email-sign-in-title">Sign in with email</h2>
          <p>No password to remember. We’ll send a one-time code.</p>
        </div>
      </div>
      <label htmlFor="otp-email" className="otp-label">Email address</label>
      <div className="otp-email-row">
        <input
          id="otp-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          className="otp-input"
          disabled={busy || sent}
        />
        <button type="button" className="otp-send-button" onClick={requestCode} disabled={busy || !email.trim()}>
          {busy && !sent ? "Sending…" : sent ? "Sent" : "Send code"}
        </button>
      </div>
      {sent && (
        <div className="otp-change-row">
          <span>Wrong address?</span>
          <button type="button" onClick={() => { setSent(false); setCode(""); setMfaCode(""); setMessage(""); setError(""); }}>Change email</button>
        </div>
      )}
      {sent && (
        <form onSubmit={verifyCode} className="otp-code-form">
          <label htmlFor="otp-code" className="otp-label">Six-digit code</label>
          <input
            id="otp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="otp-input otp-code-input"
          />
          <label htmlFor="otp-mfa-code" className="otp-label">Authenticator code or recovery code (if enabled)</label>
          <input id="otp-mfa-code" name="mfaCode" type="text" inputMode="text" autoComplete="one-time-code" maxLength={32} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32))} placeholder="6-digit code" className="otp-input otp-code-input" />
          <button type="submit" className="otp-submit-button" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify and sign in"} <ArrowRight size={15} />
          </button>
        </form>
      )}
      <p className="otp-feedback" aria-live="polite">{error || message}</p>
      <p className="otp-security"><ShieldCheck size={13} /> Codes expire after 10 minutes and can only be used once.</p>
    </section>
  );
}
