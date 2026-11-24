/** hreflang tag and sitemap generation. Pure functions: every value is escaped for the place it is written. */
export type Row = { lang: string; region: string; url: string };

export function hreflangValue(lang: string, region: string) {
  if (!lang) return "";
  return region ? `${lang}-${region}` : lang;
}

/** Escapes text for use inside an HTML attribute or XML text node. */
export function escapeMarkup(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only absolute http(s) URLs are accepted, so a javascript: or data: link can never be generated. */
export function isHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

export function buildHtmlTags(rows: Row[], xDefault: string): string {
  const lines = rows
    .filter((r) => r.lang && r.url)
    .map((r) => `<link rel="alternate" hreflang="${escapeMarkup(hreflangValue(r.lang, r.region))}" href="${escapeMarkup(r.url)}" />`);
  if (xDefault) lines.push(`<link rel="alternate" hreflang="x-default" href="${escapeMarkup(xDefault)}" />`);
  return lines.join("\n");
}

export function buildSitemapXml(rows: Row[], xDefault: string): string {
  const valid = rows.filter((r) => r.lang && r.url);
  if (!valid.length) return "";
  const alternates = [
    ...valid.map((r) => `  <xhtml:link rel="alternate" hreflang="${escapeMarkup(hreflangValue(r.lang, r.region))}" href="${escapeMarkup(r.url)}" />`),
    ...(xDefault ? [`  <xhtml:link rel="alternate" hreflang="x-default" href="${escapeMarkup(xDefault)}" />`] : []),
  ].join("\n");
  return valid.map((row) => `<url>\n  <loc>${escapeMarkup(row.url)}</loc>\n${alternates}\n</url>`).join("\n\n");
}

export function validate(rows: Row[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.lang) errors.push(`Row ${i + 1}: language is required.`);
    if (!r.url) errors.push(`Row ${i + 1}: URL is required.`);
    else if (!isHttpUrl(r.url)) errors.push(`Row ${i + 1}: URL must start with http:// or https://.`);
    const key = hreflangValue(r.lang, r.region);
    if (key && seen.has(key)) errors.push(`Duplicate hreflang value: ${key}`);
    if (key) seen.add(key);
  });
  return errors;
}
