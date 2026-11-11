"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";

export function AccountDataControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function deleteAccount(confirmation: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/account/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Account deletion failed.");
      router.replace("/");
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Account deletion failed.");
    } finally { setBusy(false); }
  }
  return <>
    <div className="account-data-controls"><a href="/api/account/export"><Download size={14} /> Export my data</a><button type="button" onClick={() => setDialogOpen(true)} disabled={busy}><Trash2 size={14} /> Delete account</button></div>
    <WorkspaceActionDialog
      open={dialogOpen}
      eyebrow="PERMANENT ACCOUNT ACTION"
      title="Delete your account?"
      description="This permanently deletes your account and personal SEO data. Organizations with other members must be transferred before this account can be deleted."
      input={{ label: "To continue, type", requiredValue: "DELETE MY ACCOUNT" }}
      confirmLabel="Delete account"
      destructive
      onCancel={() => setDialogOpen(false)}
      onConfirm={deleteAccount}
    />
  </>;
}
