"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Mail, RotateCw, ShieldCheck, Timer } from "lucide-react";

const CODE_LIFETIME_SECONDS = 15 * 60;

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function EmailOtpForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while a code is outstanding so the countdown stays live.
  useEffect(() => {
    if (!sent || expiresAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sent, expiresAt]);

  const remainingSeconds = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = remainingSeconds === 0;

  // The copy icon in the sign-in email links to /login#otp=123456&email=…; the fragment never reaches the server.
  // Fill the form from it, then strip it from the address bar. The user still clicks Verify (no auto sign-in),
  // so link scanners that open the URL can't use up the code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const linkedCode = params.get("otp") ?? "";
    const linkedEmail = (params.get("email") ?? "").trim();
    const linkedExpiry = Number(params.get("exp")) * 1000;
    if (!/^\d{6}$/.test(linkedCode)) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (linkedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkedEmail)) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL fragment, unavailable during server render */
    setEmail(linkedEmail);
    setCode(linkedCode);
    setSent(true);
    const current = Date.now();
    setNow(current);
    // Trust the link's expiry only within the real code lifetime.
    setExpiresAt(Number.isFinite(linkedExpiry) && linkedExpiry > 0 ? Math.min(linkedExpiry, current + CODE_LIFETIME_SECONDS * 1000) : current + CODE_LIFETIME_SECONDS * 1000);
    setMessage("Code filled in from your email. Click Verify to sign in.");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
      const result = await response.json() as { message?: string; expiresInSeconds?: number };
      if (!response.ok) {
        setError(result.message || "We could not send a sign-in code.");
        return;
      }
      const lifetime = typeof result.expiresInSeconds === "number" && result.expiresInSeconds > 0 ? result.expiresInSeconds : CODE_LIFETIME_SECONDS;
      const current = Date.now();
      setNow(current);
      setExpiresAt(current + lifetime * 1000);
      setCode("");
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
          <button type="button" onClick={() => { setSent(false); setCode(""); setMfaCode(""); setMessage(""); setError(""); setExpiresAt(null); }}>Change email</button>
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
            disabled={expired}
          />
          {remainingSeconds !== null && (
            expired ? (
              <div className="otp-timer otp-timer-expired" role="status">
                <span><Timer size={12} /> Code expired</span>
                <button type="button" onClick={requestCode} disabled={busy}>
                  <RotateCw size={11} /> {busy ? "Sending…" : "Send a new code"}
                </button>
              </div>
            ) : (
              <div className="otp-timer" aria-live="off">
                <span><Timer size={12} /> Code expires in <strong>{formatRemaining(remainingSeconds)}</strong></span>
              </div>
            )
          )}
          <label htmlFor="otp-mfa-code" className="otp-label">Authenticator code or recovery code (if enabled)</label>
          <input id="otp-mfa-code" name="mfaCode" type="text" inputMode="text" autoComplete="one-time-code" maxLength={32} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32))} placeholder="6-digit code" className="otp-input otp-code-input" />
          <button type="submit" className="otp-submit-button" disabled={busy || expired || code.length !== 6}>
            {busy ? "Verifying…" : "Verify and sign in"} <ArrowRight size={15} />
          </button>
        </form>
      )}
      <p className="otp-feedback" aria-live="polite">{error || message}</p>
      <p className="otp-security"><ShieldCheck size={13} /> Codes expire after 15 minutes and can only be used once.</p>
    </section>
  );
}
