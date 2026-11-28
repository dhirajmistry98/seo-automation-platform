"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { GUIDE_GROUPS } from "@/lib/google/guides";

export function GoogleGuideLibrary() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = GUIDE_GROUPS.filter((group) => !topic || group.title === topic)
    .map((group) => ({ ...group, guides: group.guides.filter((guide) => words.every((word) => `${group.title} ${guide.title} ${guide.summary}`.toLowerCase().includes(word))) }))
    .filter((group) => group.guides.length);
  const shown = groups.reduce((total, group) => total + group.guides.length, 0);
  return <section className="workspace-panel gin ggl" aria-label="Google guidelines library">
    <div className="gin-filters">
      <label className="is-long">Search the guides<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="sitemap, redirect, penalty…" /></label>
      <label>Topic<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">All topics</option>{GUIDE_GROUPS.map((group) => <option key={group.title}>{group.title}</option>)}</select></label>
    </div>
    <p className="gin-empty" role="status">{shown} guide{shown === 1 ? "" : "s"}. Summaries are ours; open the Google page for the full, current rules.</p>
    {groups.map((group) => <div key={group.title}><h3>{group.title}</h3><div className="ggl-grid">{group.guides.map((guide) => <a className="ggl-card" key={guide.url} href={guide.url} target="_blank" rel="noopener noreferrer"><strong>{guide.title}<ExternalLink size={13} aria-hidden="true" /></strong><small>{guide.summary}</small></a>)}</div></div>)}
  </section>;
}
