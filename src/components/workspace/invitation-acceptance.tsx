"use client";

import { useState } from "react";
import Link from "next/link";
import { readJson } from "@/lib/read-json";

export function InvitationAcceptance({ token }: { token: string }) {
  const [message, setMessage] = useState(token ? "This invitation can be accepted once." : "This invitation link is missing a valid token.");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try {
      const response = await fetch("/api/organizations/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || "Could not accept invitation.");
      setAccepted(true); setMessage("You joined the organization. It is now available in your workspace.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not accept invitation."); } finally { setBusy(false); }
  }
  return <><p>{message}</p>{accepted ? <Link className="invite-button" href="/dashboard">Open workspace</Link> : <button className="invite-button" type="button" onClick={accept} disabled={!token || busy}>{busy ? "Accepting…" : "Accept invitation"}</button>}</>;
}
