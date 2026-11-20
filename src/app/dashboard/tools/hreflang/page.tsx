"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Plus, Trash2 } from "lucide-react";

type Row = { lang: string; region: string; url: string };

const COMMON_LANGS = [
  { code: "en", label: "English" }, { code: "hi", label: "Hindi" }, { code: "es", label: "Spanish" },
  { code: "fr", label: "French" }, { code: "de", label: "German" }, { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" }, { code: "zh", label: "Chinese" }, { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" }, { code: "ru", label: "Russian" }, { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" }, { code: "pl", label: "Polish" }, { code: "tr", label: "Turkish" },
];

const REGIONS = [
  { code: "", label: "No region" },
  { code: "US", label: "United States" }, { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" }, { code: "AU", label: "Australia" }, { code: "CA", label: "Canada" },
  { code: "SG", label: "Singapore" }, { code: "AE", label: "UAE" }, { code: "NZ", label: "New Zealand" },
  { code: "ZA", label: "South Africa" }, { code: "NG", label: "Nigeria" }, { code: "PK", label: "Pakistan" },
  { code: "BD", label: "Bangladesh" }, { code: "DE", label: "Germany" }, { code: "FR", label: "France" },
  { code: "ES", label: "Spain" }, { code: "MX", label: "Mexico" }, { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" }, { code: "CN", label: "China" }, { code: "KR", label: "South Korea" },
  { code: "RU", label: "Russia" }, { code: "IT", label: "Italy" }, { code: "NL", label: "Netherlands" },
];

function hreflangValue(lang: string, region: string) {
  if (!lang) return "";
  return region ? `${lang}-${region}` : lang;
}

function buildHtmlTags(rows: Row[], xDefault: string): string {
  const lines = rows
    .filter((r) => r.lang && r.url)
    .map((r) => `<link rel="alternate" hreflang="${hreflangValue(r.lang, r.region)}" href="${r.url}" />`);
  if (xDefault) lines.push(`<link rel="alternate" hreflang="x-default" href="${xDefault}" />`);
  return lines.join("\n");
}

function buildSitemapXml(rows: Row[], xDefault: string): string {
  const valid = rows.filter((r) => r.lang && r.url);
  if (!valid.length) return "";
  const urls = valid.map((r) => r.url);
  if (xDefault) urls.push(xDefault);
  return valid.map((row) => `<url>
  <loc>${row.url}</loc>
${[...valid.map((r) => `  <xhtml:link rel="alternate" hreflang="${hreflangValue(r.lang, r.region)}" href="${r.url}" />`), xDefault ? `  <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />` : ""].filter(Boolean).join("\n")}
</url>`).join("\n\n");
}

function validate(rows: Row[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.lang) errors.push(`Row ${i + 1}: language is required.`);
    if (!r.url) errors.push(`Row ${i + 1}: URL is required.`);
    else { try { new URL(r.url); } catch { errors.push(`Row ${i + 1}: URL is not valid.`); } }
    const key = hreflangValue(r.lang, r.region);
    if (key && seen.has(key)) errors.push(`Duplicate hreflang value: ${key}`);
    if (key) seen.add(key);
  });
  return errors;
}

export default function HreflangBuilderPage() {
  const [rows, setRows] = useState<Row[]>([
    { lang: "en", region: "US", url: "" },
    { lang: "en", region: "GB", url: "" },
  ]);
  const [xDefault, setXDefault] = useState("");
  const [outputTab, setOutputTab] = useState<"html" | "sitemap">("html");
  const [copied, setCopied] = useState(false);

  const addRow = () => setRows((r) => [...r, { lang: "en", region: "", url: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const errors = validate(rows);
  const html = buildHtmlTags(rows, xDefault);
  const sitemap = buildSitemapXml(rows, xDefault);
  const output = outputTab === "html" ? html : sitemap;

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="workspace-section">
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow"><span /> TOOLS</p>
          <h1>hreflang Builder</h1>
          <p>Generate hreflang tags for international SEO. Add one row per language/region variant of your page.</p>
        </div>
        <Link href="/dashboard/tools" className="workspace-outline-link"><ArrowLeft size={14} /> All tools</Link>
      </header>

      <div className="hreflang-layout">
        <div className="hreflang-editor">
          <div className="hreflang-table-wrap">
            <table className="hreflang-table">
              <thead>
                <tr><th>Language</th><th>Region</th><th>Page URL</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <select value={row.lang} onChange={(e) => updateRow(i, { lang: e.target.value })}>
                        {COMMON_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.region} onChange={(e) => updateRow(i, { region: e.target.value })}>
                        {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.code ? `${r.label} (${r.code})` : "No region"}</option>)}
                      </select>
                    </td>
                    <td><input type="url" placeholder="https://example.com/page" value={row.url} onChange={(e) => updateRow(i, { url: e.target.value })} /></td>
                    <td><button className="hreflang-remove" onClick={() => removeRow(i)} disabled={rows.length <= 1}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hreflang-actions-row">
            <button className="workspace-outline-link" onClick={addRow}><Plus size={13} /> Add language</button>
          </div>

          <div className="ai-form-row hreflang-xdefault">
            <label>x-default URL <small>(the fallback page when no language matches)</small></label>
            <input type="url" placeholder="https://example.com/page" value={xDefault} onChange={(e) => setXDefault(e.target.value)} />
          </div>

          {errors.length > 0 && (
            <div className="hreflang-errors">
              {errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
        </div>

        <div className="schema-gen-preview">
          <div className="schema-preview-header">
            <div className="hreflang-output-tabs">
              <button className={outputTab === "html" ? "is-active" : ""} onClick={() => setOutputTab("html")}>HTML tags</button>
              <button className={outputTab === "sitemap" ? "is-active" : ""} onClick={() => setOutputTab("sitemap")}>Sitemap XML</button>
            </div>
            <button className={`workspace-outline-link schema-copy-btn${copied ? " is-copied" : ""}`} onClick={copy} disabled={!output}>
              {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
          <pre className="schema-preview-code">{output || "Fill in the form to see output."}</pre>
          {outputTab === "html" && <p className="schema-preview-hint">Add these inside the <code>&lt;head&gt;</code> of each language variant of the page.</p>}
          {outputTab === "sitemap" && <p className="schema-preview-hint">Add the <code>xmlns:xhtml</code> namespace to your sitemap&apos;s <code>&lt;urlset&gt;</code> element.</p>}
        </div>
      </div>
    </div>
  );
}
