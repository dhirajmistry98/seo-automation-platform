"use client";

import { ArrowRight, BarChart3, Boxes, BotMessageSquare, BriefcaseBusiness, FileBarChart, Globe2, LayoutGrid, LockKeyhole, Plus, Radar, ScanSearch, Search, Settings2, Target, UsersRound, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Entry = { label: string; hint: string; href: string; icon: LucideIcon; terms: string };

const FEATURES: Entry[] = [
  { label: "Overview", hint: "Your dashboard summary", href: "/dashboard", icon: LayoutGrid, terms: "home dashboard summary kpi stats" },
  { label: "Websites", hint: "Add, verify and manage your sites", href: "/dashboard/websites", icon: Globe2, terms: "sites domains add website verify dns portfolio" },
  { label: "Add a website", hint: "Start tracking a new domain", href: "/dashboard/websites#website-domain", icon: Plus, terms: "new site domain add connect" },
  { label: "SEO tools", hint: "Site audits and fix lists", href: "/dashboard/tools", icon: Boxes, terms: "audit crawl technical issues fix tasks errors" },
  { label: "Schema generator", hint: "Structured data / JSON-LD", href: "/dashboard/tools/schema", icon: Boxes, terms: "schema json-ld structured data rich results markup" },
  { label: "Hreflang checker", hint: "Language and region tags", href: "/dashboard/tools/hreflang", icon: Boxes, terms: "hreflang language international region translation" },
  { label: "Redirect checker", hint: "Find redirect chains and loops", href: "/dashboard/tools/redirects", icon: Boxes, terms: "redirect 301 302 chain loop" },
  { label: "Rank a page", hint: "Rank a page for a keyword", href: "/dashboard/rank-a-page", icon: Target, terms: "rank keyword position optimize on-page google" },
  { label: "SEO checker", hint: "Check any page's SEO instantly", href: "/dashboard/seo-checker", icon: ScanSearch, terms: "check page url analyze meta title description health score" },
  { label: "Research", hint: "Keywords, competitors, backlinks", href: "/dashboard/research", icon: Search, terms: "keyword research competitors backlinks volume serp" },
  { label: "Visibility", hint: "GEO, AEO & LLMO readiness", href: "/dashboard/visibility", icon: Radar, terms: "ai visibility geo aeo llmo chatgpt gemini perplexity claude answers citations" },
  { label: "Reports", hint: "Download a PDF report", href: "/dashboard/report", icon: FileBarChart, terms: "report pdf client export share download" },
  { label: "AI Studio", hint: "Write and improve content with AI", href: "/dashboard/ai", icon: BotMessageSquare, terms: "ai content write blog meta generate copy" },
  { label: "Integrations", hint: "Search Console, Analytics, WordPress", href: "/dashboard/integrations", icon: LockKeyhole, terms: "google search console analytics ga4 wordpress connect clicks impressions" },
  { label: "Account & team", hint: "Profile, team members, security", href: "/dashboard/account", icon: Settings2, terms: "account profile team invite members password settings billing" },
  { label: "Influencer Marketing", hint: "Find and hire Instagram creators", href: "/influencer-marketing", icon: UsersRound, terms: "influencer creators instagram campaign brand" },
  { label: "Expert Services", hint: "Hire SEO specialists", href: "/marketplace/services", icon: BriefcaseBusiness, terms: "expert services hire freelancer agency backlinks content" },
];

const looksLikeUrl = (q: string) => !/\s/.test(q) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q);

function score(entry: Entry, q: string) {
  const label = entry.label.toLowerCase();
  const hay = `${label} ${entry.hint.toLowerCase()} ${entry.terms}`;
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  return q.split(/\s+/).every((word) => hay.includes(word)) ? 1 : 0;
}

export function WorkspaceSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const raw = query.trim();
  const matches = useMemo(() => q
    ? FEATURES.map((entry) => ({ entry, s: score(entry, q) })).filter((m) => m.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map((m) => m.entry)
    : FEATURES.slice(0, 6), [q]);
  const actions: Entry[] = !raw ? [] : looksLikeUrl(raw) ? [
    { label: `Check the SEO of ${raw}`, hint: "Instant health score and issues", href: `/dashboard/seo-checker?url=${encodeURIComponent(raw)}`, icon: ScanSearch, terms: "" },
    { label: `Add ${raw} as a website`, hint: "Track rankings, health and AI visibility", href: `/dashboard/websites?domain=${encodeURIComponent(raw)}#website-domain`, icon: Plus, terms: "" },
  ] : [
    { label: `Rank a page for “${raw}”`, hint: "See your Google position and a plan to move up", href: `/dashboard/rank-a-page?keyword=${encodeURIComponent(raw)}`, icon: Target, terms: "" },
    { label: `Research “${raw}”`, hint: "Keyword volume, competitors and SERP", href: "/dashboard/research", icon: BarChart3, terms: "" },
  ];
  const items = [...matches, ...actions];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    }
    function onClick(e: MouseEvent) { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false); setQuery(""); inputRef.current?.blur();
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  }

  const renderItem = (entry: Entry, index: number) => {
    const Icon = entry.icon;
    return <li key={entry.href + entry.label} id={`${listId}-${index}`} role="option" aria-selected={index === active} className={index === active ? "is-active" : ""} onMouseEnter={() => setActive(index)} onMouseDown={(e) => { e.preventDefault(); go(entry); }}>
      <span className="ws-search-item-icon"><Icon size={15} aria-hidden="true" /></span>
      <span className="ws-search-item-copy"><strong>{entry.label}</strong><small>{entry.hint}</small></span>
      <ArrowRight size={14} className="ws-search-item-go" aria-hidden="true" />
    </li>;
  };

  return (
    <form ref={boxRef} className="workspace-search-form" role="search" onSubmit={(e) => { e.preventDefault(); go(items[active]); }}>
      <Search size={14} className="workspace-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="workspace-search-input"
        placeholder="Search features, or type a keyword or URL…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && items.length ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label="Search workspace"
      />
      <kbd className="workspace-search-kbd">⌘K</kbd>
      {open && <div className="ws-search-panel">
        <ul id={listId} role="listbox" aria-label="Search suggestions">
          <li className="ws-search-group" role="presentation">{q ? (matches.length ? "Features" : `No feature called “${raw}”`) : "Jump to"}</li>
          {matches.map((entry, i) => renderItem(entry, i))}
          {actions.length > 0 && <li className="ws-search-group" role="presentation">{looksLikeUrl(raw) ? "Do something with this URL" : "Do something with this keyword"}</li>}
          {actions.map((entry, i) => renderItem(entry, matches.length + i))}
        </ul>
        <p className="ws-search-foot"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
      </div>}
    </form>
  );
}
