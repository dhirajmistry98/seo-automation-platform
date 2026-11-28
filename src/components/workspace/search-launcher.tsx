"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ENGINE_GROUPS, searchText } from "@/lib/google/search-launcher";

const COUNTRIES = [["", "Automatic"], ["in", "India"], ["us", "United States"], ["gb", "United Kingdom"], ["ae", "United Arab Emirates"], ["ca", "Canada"], ["au", "Australia"]];

export function SearchLauncher({ domain }: { domain: string }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [onlySite, setOnlySite] = useState(false);
  const text = searchText(query);
  const forGoogle = searchText(query, onlySite ? domain : "");
  return <section className="workspace-panel gin ggl" aria-label="Search launcher">
    <form className="gin-filters" onSubmit={(e) => { e.preventDefault(); if (forGoogle) window.open(ENGINE_GROUPS[0].engines[0].url(forGoogle, country), "_blank", "noopener,noreferrer"); }}>
      <label className="is-long">Keyword or question<input type="search" value={query} maxLength={300} onChange={(e) => setQuery(e.target.value)} placeholder="best wooden furniture in Jaipur" /></label>
      <label>Country<select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label className="gin-check"><input type="checkbox" checked={onlySite} onChange={(e) => setOnlySite(e.target.checked)} /> Google: only {domain}</label>
      <button type="submit" disabled={!text}>Search Google</button>
    </form>
    <p className="gin-empty">Each shortcut opens in a new tab and sends your search to that service. Country applies to Google, Trends and Bing. Results can differ by person, place and sign-in.</p>
    {ENGINE_GROUPS.map((group, index) => <div key={group.title}><h3>{group.title}</h3><div className="ggl-grid">{group.engines.map((engine) => {
      const value = index === 0 && engine.id !== "trends" ? forGoogle : text;
      return <a className="ggl-card" key={engine.id} aria-disabled={!value} href={value ? engine.url(value, country) : undefined} target="_blank" rel="noopener noreferrer"><strong>{engine.label}<ExternalLink size={13} aria-hidden="true" /></strong><small>{engine.use}</small></a>;
    })}</div></div>)}
    <p className="ggl-links is-flush"><Link href="/dashboard/research">Check automatically whether AI answers mention you</Link></p>
  </section>;
}
