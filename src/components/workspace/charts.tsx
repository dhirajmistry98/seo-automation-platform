import type { ReactNode } from "react";

/** Small dependency-free SVG charts. Server-renderable, theme-aware through CSS classes, and readable by screen readers. */
type Point = { label: string; value: number };
const nf = (value: number) => (Math.abs(value) >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }));

/** `empty` is shown when there is no data at all, so a page can say exactly what to connect or run. */
export function LineChart({ points, label, unit = "", empty }: { points: Point[]; label: string; unit?: string; empty?: ReactNode }) {
  if (points.length === 0) return <p className="chart-empty">{empty ?? "No data yet."}</p>;
  if (points.length === 1) return <p className="chart-empty"><b className="chart-single">{nf(points[0].value)}{unit}</b> on {points[0].label}. A trend line appears after the next report.</p>;
  const W = 260, H = 140, L = 30, R = 8, T = 10, B = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = (index: number) => L + (index / (points.length - 1)) * (W - L - R);
  const y = (value: number) => T + (1 - (value - min) / span) * (H - T - B);
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const area = `${L},${H - B} ${line} ${x(points.length - 1)},${H - B}`;
  return <figure className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.map((point) => `${point.label} ${nf(point.value)}${unit}`).join(", ")}`}>
    {[0, 0.5, 1].map((fraction) => <g key={fraction}><line className="chart-grid" x1={L} x2={W - R} y1={T + fraction * (H - T - B)} y2={T + fraction * (H - T - B)} /><text className="chart-axis" x={L - 4} y={T + fraction * (H - T - B) + 3} textAnchor="end">{nf(max - fraction * span)}{unit}</text></g>)}
    <polygon className="chart-area" points={area} /><polyline className="chart-line" points={line} fill="none" />
    {points.map((point, index) => <circle key={index} className="chart-dot" cx={x(index)} cy={y(point.value)} r="2.6"><title>{`${point.label}: ${nf(point.value)}${unit}`}</title></circle>)}
    <text className="chart-axis" x={L} y={H - 6} textAnchor="start">{points[0].label}</text><text className="chart-axis" x={W - R} y={H - 6} textAnchor="end">{points.at(-1)?.label}</text>
  </svg><figcaption>{label}</figcaption></figure>;
}

export function ColumnChart({ data, label, empty }: { data: Point[]; label: string; empty?: ReactNode }) {
  if (!data.some((point) => point.value > 0)) return <p className="chart-empty">{empty ?? "No data yet."}</p>;
  const W = 260, H = 140, T = 18, B = 22;
  const max = Math.max(1, ...data.map((point) => point.value));
  const slot = (W - 12) / Math.max(1, data.length), bar = Math.min(40, slot * 0.62);
  return <figure className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${data.map((point) => `${point.label} ${point.value}`).join(", ")}`}>
    <line className="chart-grid" x1="6" x2={W - 6} y1={H - B} y2={H - B} />
    {data.map((point, index) => { const height = (point.value / max) * (H - T - B); const cx = 6 + slot * index + slot / 2; return <g key={point.label}>
      <rect className="chart-bar" x={cx - bar / 2} y={H - B - height} width={bar} height={Math.max(point.value ? 2 : 0, height)} rx="3"><title>{`${point.label}: ${point.value}`}</title></rect>
      <text className="chart-value" x={cx} y={H - B - height - 4} textAnchor="middle">{point.value}</text><text className="chart-axis" x={cx} y={H - 8} textAnchor="middle">{point.label}</text></g>; })}
  </svg><figcaption>{label}</figcaption></figure>;
}

export function DonutChart({ slices, label }: { slices: Array<Point & { tone: "good" | "ok" | "bad" | "none" }>; label: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return <figure className="chart chart-donut"><svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}`}>
    <circle cx="60" cy="60" r={R} className="chart-ring" fill="none" strokeWidth="14" />
    {total > 0 && slices.filter((slice) => slice.value > 0).map((slice) => { const length = (slice.value / total) * C; const el = <circle key={slice.label} cx="60" cy="60" r={R} fill="none" strokeWidth="14" className={`chart-slice chart-slice-${slice.tone}`} strokeDasharray={`${length} ${C - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"><title>{`${slice.label}: ${slice.value}`}</title></circle>; offset += length; return el; })}
    <text className="chart-center" x="60" y="64" textAnchor="middle">{total}</text></svg>
    <figcaption><ul>{slices.map((slice) => <li key={slice.label}><i className={`chart-slice-${slice.tone}`} />{slice.label} <b>{slice.value}</b></li>)}</ul></figcaption></figure>;
}

const RING_TONE = (value: number | null) => (value === null ? "none" : value >= 80 ? "good" : value >= 50 ? "ok" : "bad");

/** A score ring with the number in the middle. `suffix` is shown after the number, e.g. "%". */
export function RingScore({ value, label, suffix = "", size = 64 }: { value: number | null; label: string; suffix?: string; size?: number }) {
  const R = 26, C = 2 * Math.PI * R;
  const shown = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <svg className="score-ring" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${label}: ${value === null ? "no data" : `${value}${suffix}`}`}>
    <circle cx="32" cy="32" r={R} className="chart-ring" fill="none" strokeWidth="7" />
    {value !== null && <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round" className={`chart-slice-${RING_TONE(value)}`} strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 32 32)" />}
    <text className="score-ring-text" x="32" y="36" textAnchor="middle">{value === null ? "—" : `${value}${suffix}`}</text>
  </svg>;
}

/** A tiny filled trend with no axes, for stat cards. Draws nothing for fewer than two points. */
export function MiniArea({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const W = 140, H = 40, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((value, index) => `${(index / (values.length - 1)) * W},${H - 3 - ((value - min) / span) * (H - 8)}`).join(" ");
  return <svg className="mini-area" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}><polygon points={`0,${H} ${pts} ${W},${H}`} className="chart-area" /><polyline points={pts} className="chart-line" fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}
