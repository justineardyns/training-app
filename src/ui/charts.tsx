import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

// Kleine, rustige grafieken in SVG. Eén reeks per grafiek (small multiples), dus geen legende nodig:
// de titel zegt wat er staat. Elke grafiek heeft een tabelweergave.

const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
export const fmt = (n: number) => nf.format(n);

export function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  // Tot de eerste tick die het maximum omvat: de lijn mag nooit boven de as uitkomen.
  for (let v = start; out.length < 12; v += step) {
    out.push(Math.round(v * 100) / 100);
    if (v >= max - 1e-9) break;
  }
  return out;
}

export interface Point {
  label: string;
  value: number;
}

/** Lijngrafiek voor één reeks (bv. geschatte 1RM per week). Tik of hover op een punt voor de waarde. */
export function LineChart(props: { points: Point[]; unit?: string; title: string }) {
  const { points } = props;
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 128;
  const pad = { l: 34, r: 56, t: 12, b: 22 };
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const padY = Math.max((hi - lo) * 0.15, hi * 0.03, 1);
  const ticks = niceTicks(Math.max(0, lo - padY), hi + padY);
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const x = (i: number) => (points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const last = points.length - 1;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setActive(best);
  };
  const shown = active ?? null;

  return (
    <svg
      class="viz"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${props.title}: ${points.map((p) => `${p.label} ${fmt(p.value)}${props.unit ?? ''}`).join(', ')}`}
      onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
      onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
      onPointerLeave={(e) => {
        // Bij aanraking volgt "leave" meteen na het loslaten: laat de tooltip dan staan.
        if (e.pointerType === 'mouse') setActive(null);
      }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line class="viz-grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          <text class="viz-tick" x={pad.l - 6} y={y(t) + 4} text-anchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        points.length <= 8 || i === 0 || i === last ? (
          <text key={p.label} class="viz-tick" x={x(i)} y={H - 6} text-anchor="middle">
            {p.label}
          </text>
        ) : null,
      )}
      {points.length > 1 && <path class="viz-area" d={area} />}
      {points.length > 1 && <path class="viz-line" d={path} />}
      <circle class="viz-dot" cx={x(last)} cy={y(points[last]!.value)} r={4} />
      <text class="viz-label" x={x(last) + 8} y={y(points[last]!.value) + 4}>
        {fmt(points[last]!.value)}
        {props.unit}
      </text>
      {shown !== null && (
        <g class="viz-tip">
          <line class="viz-cross" x1={x(shown)} x2={x(shown)} y1={pad.t} y2={H - pad.b} />
          <circle class="viz-dot" cx={x(shown)} cy={y(points[shown]!.value)} r={4} />
          <g transform={`translate(${Math.min(Math.max(x(shown) - 38, 2), W - 78)}, ${2})`}>
            <rect width="76" height="30" rx="6" class="viz-tipbox" />
            <text x="8" y="13" class="viz-tipval">
              {fmt(points[shown]!.value)}
              {props.unit}
            </text>
            <text x="8" y="25" class="viz-tiplab">
              {points[shown]!.label}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** Gerangschikte horizontale balken, één kleur, waarde aan het uiteinde. */
export function BarList(props: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <div class="barlist" role="list">
      {props.rows.map((r) => (
        <div class="barrow" role="listitem" key={r.label} title={`${r.label}: ${fmt(r.value)}${props.unit ?? ''}`}>
          <span class="barlabel">{r.label}</span>
          <span class="bartrack">
            <span class="bar" style={{ width: `${(r.value / max) * 100}%` }} />
            <span class="barval">{fmt(r.value)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Sparkline: vroegere dagen in grijs, de laatste 7 in de accentkleur, je gemiddelde als haarlijn. */
export function Sparkline(props: { values: (number | undefined)[]; baseline?: number | null; label: string }) {
  const W = 120;
  const H = 32;
  const pts = props.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== undefined);
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p.v).concat(props.baseline ? [props.baseline] : []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => 2 + (i * (W - 6)) / Math.max(1, props.values.length - 1);
  const y = (v: number) => 3 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - 6);
  const cut = props.values.length - 7;
  const seg = (list: typeof pts) => list.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const old = pts.filter((p) => p.i <= cut);
  const recent = pts.filter((p) => p.i >= cut);
  return (
    <svg class="viz spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      {props.baseline ? <line class="viz-grid" x1="0" x2={W} y1={y(props.baseline)} y2={y(props.baseline)} /> : null}
      {old.length > 1 && <path class="viz-line deemph" d={seg(old)} />}
      {recent.length > 1 && <path class="viz-line" d={seg(recent)} />}
    </svg>
  );
}

export function StatTile(props: { label: string; value: string; sub?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="tile">
      <span class="tile-label">{props.label}</span>
      <span class="tile-value">{props.value}</span>
      {props.sub && <span class="tile-sub">{props.sub}</span>}
      {props.children}
    </div>
  );
}

/** Tabelweergave: alle waarden bereikbaar zonder hover. */
export function DataTable(props: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table class="datatable">
      <thead>
        <tr>
          {props.head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{typeof c === 'number' ? fmt(c) : c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
