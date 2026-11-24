"use client";

import { Download } from "lucide-react";
import { reportCsv } from "@/lib/integrations/research-utils";

type Row = Record<string, unknown>;
export type ExtendedReport = { kind: string; query: string; result: Row[] };

function Empty({ columns, message }: { columns: number; message: string }) { return <tr><td colSpan={columns}>{message}</td></tr>; }
function n(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function fmt(value: unknown, digits = 0) { const number = n(value); return number === null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits }); }
function text(value: unknown) { return typeof value === "string" && value ? value : "—"; }
function safeHref(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}
function ExternalLink({ href, children }: { href: unknown; children: React.ReactNode }) { const safe = safeHref(href); return safe ? <a href={safe} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>; }
function shortUrl(value: unknown) { if (typeof value !== "string") return "—"; try { const url = new URL(value); return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } }

export function ExportButton({ rows, name }: { rows: Row[]; name: string }) {
  if (!rows.length) return null;
  function download() {
    const blob = new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return <button type="button" className="research-export" onClick={download}><Download size={13} aria-hidden="true" /> Export CSV</button>;
}

function Cannibalization({ report }: { report: ExtendedReport }) {
  return <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Search query</th><th>Impressions</th><th>Clicks</th><th>Competing pages (share · position)</th></tr></thead><tbody>{report.result.length ? report.result.map((row, index) => <tr key={`${text(row.keyword)}-${index}`}><td>{text(row.keyword)}</td><td>{fmt(row.impressions)}</td><td>{fmt(row.clicks)}</td><td>{(Array.isArray(row.pages) ? row.pages as Row[] : []).map((page, pageIndex) => <div key={pageIndex}><ExternalLink href={page.page}>{shortUrl(page.page)}</ExternalLink> · {fmt(page.share, 1)}% · #{fmt(page.position, 1)}</div>)}</td></tr>) : <Empty columns={4} message="No cannibalization found: each search mostly goes to one of your pages." />}</tbody></table><p className="research-data-note">From your Search Console data for the last 28 days. Fix by merging the pages, making one the clear target (internal links, canonical), or giving each page a different topic.</p></div>;
}

export function ExtendedResults({ report }: { report: ExtendedReport }) {
  return report.kind === "cannibalization" ? <Cannibalization report={report} /> : null;
}
