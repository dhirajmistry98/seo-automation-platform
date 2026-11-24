/** Small dependency-free SVG charts. Server-renderable, theme-aware through CSS classes, and readable by screen readers. */
type Point = { label: string; value: number };
const nf = (value: number) => (Math.abs(value) >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }));

export function LineChart({ points, label, unit = "" }: { points: Point[]; label: string; unit?: string }) {
  if (points.length < 2) return <p className="chart-empty">Not enough history yet. Each new report adds a point.</p>;
  const W = 320, H = 150, L = 34, R = 8, T = 10, B = 24;
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
    <text className="chart-axis" x={L} y={H - 7} textAnchor="start">{points[0].label}</text><text className="chart-axis" x={W - R} y={H - 7} textAnchor="end">{points.at(-1)?.label}</text>
  </svg><figcaption>{label}</figcaption></figure>;
}

export function ColumnChart({ data, label }: { data: Point[]; label: string }) {
  const W = 320, H = 150, T = 18, B = 24;
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
