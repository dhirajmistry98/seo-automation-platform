type Row = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SeriesKey = "clicks" | "impressions" | "ctr";

const W = 720;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };
const SERIES: Array<{ key: SeriesKey; label: string; className: string }> = [
  { key: "clicks", label: "Clicks", className: "is-clicks" },
  { key: "impressions", label: "Impressions", className: "is-impressions" },
  { key: "ctr", label: "CTR", className: "is-ctr" },
];

function smoothPath(points: Array<[number, number]>) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

function shortDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function SearchTrendChart({ rows }: { rows: Row[] }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (rows.length > 1 ? (i / (rows.length - 1)) * innerW : innerW / 2);
  const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH;
  const ticks = [0, 25, 50, 75, 100];
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

  const lines = SERIES.map((series) => {
    const values = rows.map((row) => Math.max(0, Number(row[series.key]) || 0));
    const max = Math.max(...values);
    const points = values.map((value, i) => [x(i), y(max ? (value / max) * 100 : 0)] as [number, number]);
    return { ...series, points, max };
  }).filter((series) => series.max > 0);

  return <div className="search-trend-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily clicks, impressions and CTR from the latest Search Console report, each scaled to its own peak">
      {ticks.map((tick) => <g key={tick} className="search-trend-grid">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
        <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">{tick}%</text>
      </g>)}
      {rows.map((row, i) => (i % labelEvery === 0 || i === rows.length - 1) && <text key={row.keys?.[0]} className="search-trend-xlabel" x={x(i)} y={H - 8} textAnchor="middle">{shortDate(row.keys?.[0] || "")}</text>)}
      {lines.map((line) => <g key={line.key} className={line.className}>
        <path d={smoothPath(line.points)} />
        {line.points.map(([px, py], i) => (i % labelEvery === 0 || i === line.points.length - 1) && <circle key={i} cx={px} cy={py} r={3} />)}
      </g>)}
    </svg>
    <div className="search-trend-legend">
      {lines.map((line) => <span key={line.key} className={line.className}><i />{line.label}</span>)}
      <small>% of each metric&apos;s peak day in this period</small>
    </div>
  </div>;
}
