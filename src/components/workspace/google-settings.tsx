"use client";

import { useState } from "react";
import { SETTINGS, consoleUrl, propertyId, type PropertyType } from "@/lib/google/console";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function GoogleSettings({ domain, siteUrl }: { domain: string; siteUrl: string }) {
  const [type, setType] = useState<PropertyType>("domain");
  const property = propertyId(type, domain, siteUrl);
  return <section className="workspace-panel gin ggl" aria-label="Search Console settings">
    <div className="gin-filters">
      <label>Your Search Console property type<select value={type} onChange={(e) => setType(e.target.value as PropertyType)}><option value="domain">Domain property</option><option value="prefix">URL-prefix property</option></select></label>
      <p className="gin-empty">Links open <code>{property}</code> in your own Google account. If Google says you have no access, switch the type or add the property first.</p>
    </div>
    <p className="gin-empty">Google keeps these settings, so you change them in Search Console. Menu names can change over time.</p>
    <div className="ggl-settings">{SETTINGS.map((setting) => <details key={setting.name} className="ggl-setting"><summary><strong>{setting.name}</strong><small>{setting.what}</small></summary>
      <ol>{setting.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {setting.caution && <p className="ggl-caution"><strong>Careful:</strong> {setting.caution}</p>}
      <p className="ggl-links"><a href={consoleUrl(setting.path, property)} {...external}>Open in Search Console</a>{setting.guide && <a href={setting.guide} {...external}>Read Google’s guide</a>}</p>
    </details>)}</div>
  </section>;
}
