"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";

export function WebsiteDeleteControl({ domain }: { domain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function removeWebsite(confirmation: string) {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Website deletion failed.");
    router.replace("/dashboard/websites?site=deleted");
  }

  const requiredPhrase = `DELETE ${domain.toUpperCase()}`;
  return <>
    <button className="website-delete-trigger" type="button" onClick={() => setOpen(true)}><Trash2 size={14} /> Delete website</button>
    <WorkspaceActionDialog
      open={open}
      eyebrow="PERMANENT WEBSITE ACTION"
      title={`Delete ${domain}?`}
      description="This removes the website and its stored audits, pages, issues, tasks, reports, integration records, and WordPress sync history from this workspace. This cannot be undone."
      input={{ label: "To continue, type", requiredValue: requiredPhrase, maxLength: 280 }}
      confirmLabel="Delete website"
      destructive
      onCancel={() => setOpen(false)}
      onConfirm={removeWebsite}
    />
  </>;
}
