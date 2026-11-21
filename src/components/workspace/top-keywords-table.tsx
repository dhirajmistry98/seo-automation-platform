"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

type Row = { keyword: string; clicks: number; impressions: number; ctr: number; position: number };
type SortKey = "clicks" | "impressions" | "position" | "ctr";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "clicks", label: "Most clicks" },
  { key: "impressions", label: "Most impressions" },
  { key: "position", label: "Best position" },
  { key: "ctr", label: "Highest CTR" },
];

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function TopKeywordsTable({ rows, domain }: { rows: Row[]; domain: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("clicks");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => !q || row.keyword.toLowerCase().includes(q))
      .sort((a, b) => (sort === "position" ? a.position - b.position : b[sort] - a[sort]))
      .slice(0, 10);
  }, [rows, query, sort]);

  return <>
    <div className="ws2-kw-tools">
      <label className="ws2-kw-search"><Search size={14} aria-hidden="true" /><input type="search" placeholder="Search keywords…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter keywords" /></label>
      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort keywords">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
    </div>
    <div className="ws2-kw-scroll">
      <table className="ws2-kw-table">
        <thead><tr><th>Keyword</th><th>Position</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Source</th></tr></thead>
        <tbody>
          {visible.map((row) => <tr key={row.keyword}>
            <td>{row.keyword}</td>
            <td>{row.position.toFixed(1)}</td>
            <td>{fmt.format(row.clicks)}</td>
            <td>{fmt.format(row.impressions)}</td>
            <td>{(row.ctr * 100).toFixed(1)}%</td>
            <td><span className="ws2-kw-source">Google · {domain}</span></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={6} className="ws2-kw-empty">No keywords match “{query}”.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
