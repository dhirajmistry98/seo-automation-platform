"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Props = { domain: string; property: string; startDate: string; endDate: string; dimension: string };

export function OverviewSearchRefresh({ domain, property, startDate, endDate, dimension }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/search-console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, startDate, endDate, dimension }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not refresh Search Console data.");
      setMessage("Updated with the latest data available from Google.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh Search Console data.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-search-refresh">
    <button type="button" onClick={() => void refresh()} disabled={busy}>
      <RefreshCw size={12} className={busy ? "is-spinning" : ""} aria-hidden="true" />
      {busy ? "Updating…" : "Refresh from Google"}
    </button>
    {message && <span role="status">{message}</span>}
  </div>;
}
