"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyPrompt } from "@/components/workspace/copy-prompt";
import { PROMPTS, PROMPT_GROUPS } from "@/lib/google/prompts";
import { EXPORTS, PROMPT_NOTES, PROMPT_TOOLS } from "@/lib/google/prompt-help";

export function PromptLibrary() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = PROMPTS.filter((item) => (!group || item.group === group) && words.every((word) => `${item.title} ${item.goal ?? ""} ${item.prompt}`.toLowerCase().includes(word)));
  return <div className="workspace-panel gin ggl">
    <p className="gin-empty">Copy a prompt, then give it to an AI assistant with your exported data. Anything you paste is sent to that service, so remove personal and confidential details. Check its answers before acting.</p>
    <div className="gin-filters">
      <label className="is-long">Search the prompts<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="sitemap, competitor, CTR…" /></label>
      <label>Group<select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All groups</option>{PROMPT_GROUPS.map((name) => <option key={name}>{name}</option>)}</select></label>
    </div>
    <p className="gin-empty" role="status">{shown.length} of {PROMPTS.length} prompts</p>
    {PROMPT_GROUPS.map((name) => { const items = shown.filter((item) => item.group === name); return items.length ? <div key={name}><h3>{name}</h3><div className="ggl-settings">{items.map((item) => <details key={item.n} className="ggl-setting ggl-promptitem">
      <summary><strong>{item.n}. {item.title}</strong>{item.goal && <small>{item.goal}</small>}</summary>
      {item.data && <p><strong>Data:</strong> {item.data}</p>}
      {PROMPT_NOTES[item.n] && <p className="ggl-caution"><strong>Before you start:</strong> {PROMPT_NOTES[item.n]}</p>}
      <CopyPrompt text={item.prompt} />
      {PROMPT_TOOLS[item.n] && <p className="ggl-links"><Link href={PROMPT_TOOLS[item.n].href}>Open {PROMPT_TOOLS[item.n].label}</Link></p>}
    </details>)}</div></div> : null; })}
    <h3>What to export</h3>
    <div className="gin-scroll"><table className="gin-table"><thead><tr><th>Tool</th><th>Data to export</th><th>Best use</th></tr></thead><tbody>{EXPORTS.map((row) => <tr key={row.tool}><td>{row.tool}</td><td>{row.data}</td><td>{row.use}</td></tr>)}</tbody></table></div>
  </div>;
}
