"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CHECK_GROUPS } from "@/lib/google/checklist";

const EVENT = "seo-studio-checklist";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify); window.addEventListener(EVENT, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(EVENT, notify); };
};
const read = (key: string) => { try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; } };
const parse = (raw: string): string[] => { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; } };

export function GoogleChecklist({ domain }: { domain: string }) {
  const key = `google-checklist:${domain}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "");
  const done = new Set(parse(raw));
  const [error, setError] = useState("");
  const all = CHECK_GROUPS.flatMap((group) => group.checks);
  const count = all.filter((check) => done.has(check.id)).length;
  function toggle(id: string) {
    const next = new Set(done);
    if (!next.delete(id)) next.add(id);
    try { window.localStorage.setItem(key, JSON.stringify([...next])); setError(""); window.dispatchEvent(new Event(EVENT)); }
    catch { setError("Your browser would not save this. Check that site storage is allowed."); }
  }
  return <section className="workspace-panel gin ggl" aria-label="Google Search checklist">
    <div className="ggl-progress"><strong>{count} of {all.length} done</strong><progress max={all.length} value={count} aria-label="Checklist progress" /></div>
    <p className="gin-empty">You tick these yourself. Progress is saved in this browser only and is not shared with teammates.</p>
    {error && <p role="alert" className="gin-error">{error}</p>}
    {CHECK_GROUPS.map((group) => <div key={group.title}><h3>{group.title}</h3><ul className="ggl-checks">{group.checks.map((check) => <li key={check.id}>
      <label><input type="checkbox" checked={done.has(check.id)} onChange={() => toggle(check.id)} /><span>{check.text}</span></label>
      <p className="ggl-links"><a href={check.guide} target="_blank" rel="noopener noreferrer">Guide</a>{check.tool && <Link href={check.tool.href}>{check.tool.label}</Link>}</p>
    </li>)}</ul></div>)}
  </section>;
}
