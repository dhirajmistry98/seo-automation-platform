"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type ExplorerPoint = { t: number; label: string; value: number };
export type ExplorerSeries = { key: string; label: string; color: string; axis: "left" | "right"; defaultOn: boolean; points: ExplorerPoint[] };
export type ExplorerTab = { key: string; label: string; series: ExplorerSeries[]; emptyText: string; emptyHref: string; emptyLabel: string };

const nf = (value: number) => (Math.abs(value) >= 10_000 ? `${Math.round(value / 1000)}k` : Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(value * 10) / 10));
/** Round a maximum up to 1, 2 or 5 times a power of ten so axis ticks are tidy. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => value <= m * power) ?? 10;
  return step * power;
}
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Multi-series trend chart with source tabs, series checkboxes and a left and right axis. */
export function TrendExplorer({ tabs }: { tabs: ExplorerTab[] }) {
  const first = tabs.find((tab) => tab.series.some((series) => series.points.length > 0)) ?? tabs[0];
  const [tabKey, setTabKey] = useState(first?.key);
  const tab = tabs.find((item) => item.key === tabKey) ?? tabs[0];
  const [off, setOff] = useState<Record<string, boolean>>({});
  const visible = tab.series.filter((series) => series.points.length > 0 && (off[`${tab.key}:${series.key}`] ?? !series.defaultOn) === false);
  const hasData = tab.series.some((series) => series.points.length > 0);
  // Draw at the real pixel width so text stays readable and the chart fills its card.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setW(Math.max(300, Math.round(entries[0].contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const H = W < 520 ? 230 : 280, L = 46, R = 46, T = 14, B = 30;
  const times = visible.flatMap((series) => series.points.map((point) => point.t));
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const single = times.length > 0 && tMin === tMax;
  const x = (t: number) => (single ? (L + W - R) / 2 : L + ((t - tMin) / (tMax - tMin || 1)) * (W - L - R));
  const maxOf = (axis: "left" | "right") => niceMax(Math.max(0, ...visible.filter((series) => series.axis === axis).flatMap((series) => series.points.map((point) => point.value))));
  const maxes = { left: maxOf("left"), right: maxOf("right") };
  const y = (value: number, axis: "left" | "right") => T + (1 - value / maxes[axis]) * (H - T - B);
  const hasRight = visible.some((series) => series.axis === "right");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = single ? [tMin] : [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + f * (tMax - tMin));
  return <div className="trend-explorer" ref={box}>
    <div className="trend-tabs" role="tablist">{tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={item.key === tab.key} className={item.key === tab.key ? "is-current" : ""} onClick={() => setTabKey(item.key)}>{item.label}</button>)}</div>
    {!hasData ? <p className="trend-empty">{tab.emptyText} <Link href={tab.emptyHref}>{tab.emptyLabel}</Link></p> : <>
      <div className="trend-legend">{tab.series.map((series) => { const id = `${tab.key}:${series.key}`; const on = (off[id] ?? !series.defaultOn) === false; return <label key={series.key} className={series.points.length ? "" : "is-disabled"}><input type="checkbox" checked={on && series.points.length > 0} disabled={series.points.length === 0} onChange={() => setOff((current) => ({ ...current, [id]: on }))} /><i style={{ background: series.color }} />{series.label}</label>; })}</div>
      {visible.length === 0 ? <p className="trend-empty">Tick a series above to draw it.</p> : <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${tab.label} trend: ${visible.map((series) => series.label).join(", ")}`}>
        {ticks.map((f) => <g key={f}><line className="chart-grid" x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} /><text className="chart-axis" x={L - 6} y={T + f * (H - T - B) + 3} textAnchor="end">{nf((1 - f) * maxes.left)}</text>{hasRight && <text className="chart-axis" x={W - R + 6} y={T + f * (H - T - B) + 3} textAnchor="start">{nf((1 - f) * maxes.right)}</text>}</g>)}
        {xTicks.map((t, index) => <text key={index} className="chart-axis" x={x(t)} y={H - 8} textAnchor={index === 0 && !single ? "start" : index === xTicks.length - 1 && !single ? "end" : "middle"}>{day(t)}</text>)}
        {visible.map((series) => { const pts = [...series.points].sort((a, b) => a.t - b.t); return <g key={series.key} style={{ color: series.color }}>
          {pts.length > 1 && <polyline points={pts.map((point) => `${x(point.t)},${y(point.value, series.axis)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {pts.map((point) => <circle key={point.t} cx={x(point.t)} cy={y(point.value, series.axis)} r="3.2" fill="currentColor"><title>{`${series.label}, ${point.label}: ${nf(point.value)}`}</title></circle>)}</g>; })}
      </svg>}
    </>}
  </div>;
}
