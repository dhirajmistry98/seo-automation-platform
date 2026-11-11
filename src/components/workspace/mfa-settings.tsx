"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";

type Status = { enabled: boolean; remainingRecoveryCodes: number };
export function MfaSettings() {
  const [status, setStatus] = useState<Status>({ enabled: false, remainingRecoveryCodes: 0 });
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  function notify(text: string, tone: "success" | "error" = "success") { setMessage(text); setMessageTone(tone); }
  async function refresh() { const response = await fetch("/api/account/mfa", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load MFA status."); setStatus(data); }
  useEffect(() => { void Promise.resolve().then(refresh).catch((error) => notify(error.message, "error")); }, []);
  async function begin() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start MFA setup."); setUri(data.otpauthUri); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not start MFA setup.", "error"); } finally { setBusy(false); }
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", code }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not enable MFA."); setRecoveryCodes(data.recoveryCodes || []); setUri(""); setCode(""); await refresh(); notify("Authenticator MFA is enabled. Save the recovery codes somewhere safe."); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not enable MFA.", "error"); } finally { setBusy(false); }
  }
  async function disable(value: string) {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/account/mfa", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not disable MFA."); setRecoveryCodes([]); await refresh(); notify("Authenticator MFA has been disabled."); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "Could not disable MFA."); } finally { setBusy(false); }
  }
  return <section className="mfa-settings"><div><p className="workspace-eyebrow">SIGN-IN SECURITY</p><h3><ShieldCheck size={16} /> Authenticator MFA</h3><p>Require an authenticator code after the email sign-in code. Google sign-in is disabled while MFA is enabled.</p><small>{status.enabled ? `Enabled · ${status.remainingRecoveryCodes} recovery codes left` : "Not enabled"}</small></div>
    {!status.enabled ? <button type="button" onClick={begin} disabled={busy}><KeyRound size={14} /> Set up MFA</button> : <button type="button" onClick={() => setDisableDialogOpen(true)} disabled={busy}>Disable MFA</button>}
    {uri && <form onSubmit={confirm} className="mfa-setup"><p>Add this setup URI to your authenticator app, then enter the current 6-digit code:</p><textarea readOnly value={uri} rows={3} /><button type="button" onClick={() => navigator.clipboard.writeText(uri).then(() => setMessage("Setup URI copied."))}><Copy size={13} /> Copy setup URI</button><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button type="submit" disabled={busy || code.length !== 6}>Confirm and enable</button></form>}
    {!!recoveryCodes.length && <div className="mfa-recovery"><strong>Save these recovery codes. They are shown once.</strong><pre>{recoveryCodes.join("\n")}</pre><button type="button" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => setMessage("Recovery codes copied."))}><Copy size={13} /> Copy recovery codes</button></div>}
    {message && <p className={`mfa-message workspace-feedback is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p>}
    <WorkspaceActionDialog
      open={disableDialogOpen}
      eyebrow="SIGN-IN SECURITY"
      title="Disable authenticator MFA?"
      description="Enter a current authenticator code or an unused recovery code. Two-step verification will stop protecting future sign-ins."
      input={{ label: "Authenticator or recovery code", autoComplete: "one-time-code", maxLength: 64, placeholder: "Enter your code" }}
      confirmLabel="Disable MFA"
      destructive
      onCancel={() => setDisableDialogOpen(false)}
      onConfirm={disable}
    />
  </section>;
}
