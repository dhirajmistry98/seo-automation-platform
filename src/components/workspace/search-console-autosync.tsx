"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/read-json";

type State = "checking" | "working" | "not-connected" | "no-property" | "failed" | "empty";

/**
 * Connecting Google only saves a login. This pulls the first Search Console report for the site, once, then refreshes the page.
 * Rendered only where a page has no Search Console data. Does nothing when Search Console is not connected.
 */
export function SearchConsoleAutoSync({ domain }: { domain: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [others, setOthers] = useState<string[]>([]);
  const started = useRef(false);
  const base = `/api/sites/${encodeURIComponent(domain)}/search-console`;

  const sync = useCallback(async () => {
    setState("working"); setMessage("");
    try {
      const statusResponse = await fetch(`/api/integrations/google/status?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
      const status = await readJson(statusResponse);
      const connected = ((status.services || []) as Array<{ service: string; status: string }>).some((item) => item.service === "search_console" && item.status === "connected");
      if (!connected) { setState("not-connected"); return; }
      const listResponse = await fetch(base, { cache: "no-store" });
      const list = await readJson(listResponse);
      if (!listResponse.ok) throw new Error(typeof list.error === "string" ? list.error : "Could not list Search Console properties.");
      const property = ((list.properties || []) as Array<{ siteUrl: string }>)[0]?.siteUrl;
      if (!property) { setOthers((list.otherProperties || []) as string[]); setState("no-property"); return; }
      const reportResponse = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property, dimension: "query" }) });
      const report = await readJson(reportResponse);
      if (!reportResponse.ok) throw new Error(typeof report.error === "string" ? report.error : "Could not load the Search Console report.");
      if (!report.report?.rowCount) { setState("empty"); return; }
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Search Console data."); setState("failed"); }
  }, [base, domain, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let tried = false;
    try { tried = sessionStorage.getItem(`gsc-sync:${domain}`) === "1"; sessionStorage.setItem(`gsc-sync:${domain}`, "1"); } catch {}
    if (tried) { setState("failed"); setMessage("Search Console data has not loaded yet."); return; }
    void sync();
  }, [domain, sync]);

  if (state === "checking") return null;
  return <div className="gsc-sync" role="status">
    {state === "working" && <p>Loading your Search Console data…</p>}
    {state === "not-connected" && <p>Search Console is not connected for this site. <Link href="/dashboard/integrations">Connect Google</Link></p>}
    {state === "no-property" && <p>The connected Google account has no Search Console property for {domain}.{others.length > 0 && <> It can see: {others.slice(0, 5).join(", ")}.</>} <Link href="/dashboard/integrations">Reconnect with another account</Link></p>}
    {state === "empty" && <p>Search Console connected, but Google has no search data for {domain} in the last 28 days yet. New or low-traffic sites can take a few days.</p>}
    {state === "failed" && <><p>{message}</p><button type="button" onClick={() => void sync()}>Try again</button></>}
  </div>;
}
