import { useState, type ReactNode } from "react";

/** Grafici SVG fatti a mano: leggeri, nitidi, leggibili sul telefono. */

export type Series = { label: string; color: string; values: Array<number | null> };
export type Marker = { day: string; label: string; title: string };

const W = 340;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** Linee su più serie, con le versioni come linee verticali cliccabili. */
export function LineChart({
  days,
  series,
  markers = [],
  height = 160,
  onMarker,
  format = (v: number) => String(Math.round(v)),
}: {
  days: string[];
  series: Series[];
  markers?: Marker[];
  height?: number;
  onMarker?: (m: Marker) => void;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null))));
  const x = (i: number) => pad.l + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  if (!days.length) return <Empty />;
  return (
    <div className="tr-chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="tr-grid" />
            <text x={pad.l - 6} y={y(t) + 3} className="tr-axis" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <text key={d} x={x(i)} y={height - 6} className="tr-axis" textAnchor="middle">
              {shortDay(d)}
            </text>
          ) : null,
        )}
        {markers.map((m) => {
          const i = days.indexOf(m.day);
          if (i < 0) return null;
          return (
            <g key={`${m.day}-${m.label}`} className="tr-marker" onClick={() => onMarker?.(m)} role="button" aria-label={m.title}>
              <line x1={x(i)} x2={x(i)} y1={pad.t} y2={pad.t + ih} />
              <rect x={x(i) - 10} y={pad.t} width={20} height={ih} fill="transparent" />
              <circle cx={x(i)} cy={pad.t + 2} r={3.5} />
            </g>
          );
        })}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`));
          const d = pts.reduce<string>((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? " L" : " M"}${p}` : acc), "");
          return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hover !== null
          ? series.map((s) =>
              s.values[hover] !== null ? <circle key={s.label} cx={x(hover)} cy={y(s.values[hover]!)} r={3.5} fill={s.color} /> : null,
            )
          : null}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - pad.l) / iw) * (days.length - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
          style={{ pointerEvents: markers.length ? "none" : "auto" }}
        />
      </svg>
      <div className="tr-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
            {hover !== null && s.values[hover] !== null ? <b> {format(s.values[hover]!)}</b> : null}
          </span>
        ))}
        {hover !== null ? <span className="tr-legend-day">{shortDay(days[hover]!)}</span> : null}
      </div>
    </div>
  );
}

/** Barre impilate per giorno (es. nuovi + di ritorno). */
export function StackBars({
  days,
  parts,
  height = 150,
}: {
  days: string[];
  parts: Array<{ label: string; color: string; values: number[] }>;
  height?: number;
}) {
  const pad = { l: 26, r: 6, t: 8, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const totals = days.map((_, i) => parts.reduce((n, p) => n + (p.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const bw = Math.max(2, (iw / Math.max(1, days.length)) * 0.7);
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  if (!days.length) return <Empty />;
  return (
    <div className="tr-chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={parts.map((p) => p.label).join(", ")}>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="tr-grid" />
        <text x={pad.l - 5} y={pad.t + 8} className="tr-axis" textAnchor="end">
          {max}
        </text>
        {days.map((d, i) => {
          const cx = pad.l + (iw / days.length) * (i + 0.5);
          let acc = 0;
          return (
            <g key={d}>
              {parts.map((p) => {
                const v = p.values[i] ?? 0;
                const h = (v / max) * ih;
                acc += h;
                return v > 0 ? <rect key={p.label} x={cx - bw / 2} y={pad.t + ih - acc} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={p.color} /> : null;
              })}
              {i % labelEvery === 0 || i === days.length - 1 ? (
                <text x={cx} y={height - 5} className="tr-axis" textAnchor="middle">
                  {shortDay(d)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="tr-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{p.values.reduce((a, b) => a + b, 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barre orizzontali con etichetta e valore (classifiche, distribuzioni). */
export function Bars({
  items,
  format = (v) => String(v),
  color = "var(--tr-accent)",
}: {
  items: Array<{ label: ReactNode; value: number; note?: ReactNode }>;
  format?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <Empty />;
  return (
    <ul className="tr-bars">
      {items.map((it, i) => (
        <li key={i}>
          <span className="tr-bars-label">{it.label}</span>
          <span className="tr-bars-track">
            <span className="tr-bars-fill" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </span>
          <span className="tr-bars-value">
            {format(it.value)}
            {it.note ? <small> {it.note}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ text = "Ancora nessun dato" }: { text?: string }) {
  return <p className="tr-empty">{text}</p>;
}
