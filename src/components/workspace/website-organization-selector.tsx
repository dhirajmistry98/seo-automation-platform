"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Organization = { id: string; name: string };
export function WebsiteOrganizationSelector({ domain, currentOrganizationId, organizations }: { domain: string; currentOrganizationId: string; organizations: Organization[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentOrganizationId);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function move() {
    if (selected === currentOrganizationId) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/organization`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: selected }) });
      const data = await readJson(response); if (!response.ok) throw new Error(data.error || "Could not move website.");
      setMessage("Website and its audit history moved to the selected organization.");
      router.replace(`/dashboard/websites/${encodeURIComponent(domain)}?saved=1`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not move website."); } finally { setBusy(false); }
  }
  return <div className="website-org-selector"><label>Workspace<select value={selected} onChange={(event) => setSelected(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={move} disabled={busy || selected === currentOrganizationId}><ArrowRightLeft size={14} /> {busy ? "Moving…" : "Move website"}</button>{message && <p role="status">{message}</p>}</div>;
}
