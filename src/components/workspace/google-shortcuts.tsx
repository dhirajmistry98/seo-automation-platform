"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { GOOGLE_TOOLS, SEARCH_CHECKS, SETTINGS, SHORTCUT_GROUPS, consoleUrl, propertyId, type PropertyType } from "@/lib/google/console";

type Props = { domain: string; siteUrl: string; view: "shortcuts" | "settings" };
const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function GoogleShortcuts({ domain, siteUrl, view }: Props) {
  const [type, setType] = useState<PropertyType>("domain");
  const property = propertyId(type, domain, siteUrl);
  return <section className="workspace-panel gin ggl" aria-label={view === "settings" ? "Search Console settings" : "Google shortcuts"}>
    <div className="gin-filters">
      <label>Your Search Console property type<select value={type} onChange={(e) => setType(e.target.value as PropertyType)}><option value="domain">Domain property</option><option value="prefix">URL-prefix property</option></select></label>
      <p className="gin-empty">Links open <code>{property}</code> in your own Google account. If Google says you have no access, switch the type or add the property first.</p>
    </div>
    {view === "shortcuts" ? <>
      {SHORTCUT_GROUPS.map((group) => <div key={group.title}><h3>{group.title}</h3><div className="ggl-grid">{group.items.map((item) => <a className="ggl-card" key={item.label} href={consoleUrl(item.path, property)} {...external}><strong>{item.label}<ExternalLink size={13} aria-hidden="true" /></strong><small>{item.use}</small></a>)}</div></div>)}
      <h3>Other Google tools</h3><div className="ggl-grid">{GOOGLE_TOOLS.map((tool) => <a className="ggl-card" key={tool.label} href={tool.url(domain, siteUrl)} {...external}><strong>{tool.label}<ExternalLink size={13} aria-hidden="true" /></strong><small>{tool.use}</small></a>)}</div>
      <h3>Quick searches on Google</h3><p className="gin-empty">These show a sample, not a complete list of indexed pages. Use the Pages report for accurate numbers.</p>
      <div className="ggl-grid">{SEARCH_CHECKS(domain).map((item) => <a className="ggl-card" key={item.label} href={item.url} {...external}><strong>{item.label}<ExternalLink size={13} aria-hidden="true" /></strong><small><code>{item.query}</code></small></a>)}</div>
    </> : <>
      <p className="gin-empty">Google keeps these settings, so you change them in Search Console. Menu names can change over time.</p>
      <div className="ggl-settings">{SETTINGS.map((setting) => <details key={setting.name} className="ggl-setting"><summary><strong>{setting.name}</strong><small>{setting.what}</small></summary>
        <ol>{setting.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {setting.caution && <p className="ggl-caution"><strong>Careful:</strong> {setting.caution}</p>}
        <p className="ggl-links"><a href={consoleUrl(setting.path, property)} {...external}>Open in Search Console</a>{setting.guide && <a href={setting.guide} {...external}>Read Google’s guide</a>}</p>
      </details>)}</div>
    </>}
  </section>;
}
