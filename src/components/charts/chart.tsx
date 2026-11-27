"use client";
import { useId, useState } from "react";
import { labelIndices, niceScale, stepDecimals } from "@/lib/charts/ticks";
import { useWidth } from "./use-width";

/*
 * Small dependency-free SVG chart: one y axis, nice ticks, line/dot/bar series,
 * optional target band, crosshair + tooltip on hover/touch, table fallback.
 * Mark specs follow the dataviz guidance: 2px lines, ≤24px bars with 4px rounded
 * data-ends, 2px surface ring on markers, recessive grid.
 */

export interface Series {
  key: string;
  label: string;
  kind: "line" | "dots" | "bar";
  values: Array<number | null>;
  /** CSS color (a var()) — or per point, for bars coloured by category */
  color: string | ((i: number) => string);
  /** Text for the tooltip row (defaults to the formatted value). */
  format?: (v: number, i: number) => string;
}

export interface ChartProps {
  title: string;
  /** x labels (dates or interval names), one per point */
  x: string[];
  xFormat?: (x: string) => string;
  series: Series[];
  band?: { lo: number; hi: number; label: string };
  /** Horizontal reference line (e.g. HR cap or goal) */
  rule?: { y: number; label: string };
  yUnit?: string;
  zero?: boolean;
  height?: number;
  /** Legend entries; shown when there are ≥2 visual encodings. */
  legend?: Array<{ label: string; color: string; kind: "line" | "dots" | "bar" | "band" }>;
}

const M = { top: 12, right: 12, bottom: 26, left: 40 };

export function Chart({
  title,
  x,
  xFormat = (s) => s,
  series,
  band,
  rule,
  yUnit = "",
  zero,
  height = 200,
  legend,
}: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const n = x.length;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (band) all.push(band.lo, band.hi);
  if (rule) all.push(rule.y);
  const hasBars = series.some((s) => s.kind === "bar");
  const scale = niceScale(Math.min(...all), Math.max(...all), 5, { zero: zero ?? hasBars });
  const dec = stepDecimals(scale.step);
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const slot = iw / Math.max(1, n);
  const cx = (i: number) =>
    hasBars ? M.left + slot * (i + 0.5) : M.left + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const cy = (v: number) => M.top + ih - ((v - scale.min) / (scale.max - scale.min || 1)) * ih;
  const colorOf = (s: Series, i: number) => (typeof s.color === "function" ? s.color(i) : s.color);
  const fmt = (s: Series, v: number, i: number) =>
    s.format ? s.format(v, i) : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}${yUnit}`;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - px) < Math.abs(cx(best) - px)) best = i;
    setHover(n ? best : null);
  };

  if (!n || !all.length) return null;
  const barW = Math.min(24, Math.max(2, slot - 2));
  const hx = hover != null ? cx(hover) : 0;
  const tipLeft = hover != null && hx > width / 2;

  return (
    <figure className="grid gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          aria-controls={`${id}-table`}
          aria-expanded={table}
        >
          {table ? "Chart" : "Table"}
        </button>
      </figcaption>
      {legend && legend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={
                  l.kind === "line"
                    ? "h-0.5 w-4 rounded"
                    : l.kind === "dots"
                      ? "size-2 rounded-full"
                      : "size-2.5 rounded-sm"
                }
                style={{ background: l.color }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      {table ? (
        <div id={`${id}-table`} className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1 font-medium">{hasBars ? "Item" : "Date"}</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-1 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {x.map((xv, i) => (
                <tr key={`${xv}-${i}`} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">{xFormat(xv)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 tabular-nums">
                      {s.values[i] != null ? fmt(s, s.values[i]!, i) : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative w-full touch-pan-y select-none">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}. ${n} points. Use the Table button for values.`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            className="block overflow-visible"
          >
            {band ? (
              <g>
                <rect
                  x={M.left}
                  width={iw}
                  y={cy(band.hi)}
                  height={Math.max(0, cy(band.lo) - cy(band.hi))}
                  fill="var(--chart-band)"
                />
              </g>
            ) : null}
            {scale.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={M.left + iw}
                  y1={cy(t)}
                  y2={cy(t)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={M.left - 6}
                  y={cy(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {t.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                </text>
              </g>
            ))}
            {rule ? (
              <g>
                <line
                  x1={M.left}
                  x2={M.left + iw}
                  y1={cy(rule.y)}
                  y2={cy(rule.y)}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <text
                  x={M.left + iw}
                  y={cy(rule.y) - 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {rule.label}
                </text>
              </g>
            ) : null}
            {labelIndices(n, Math.max(2, Math.floor(iw / 70))).map((i) => (
              <text
                key={i}
                x={cx(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {xFormat(x[i]!)}
              </text>
            ))}
            {series.map((s) => {
              if (s.kind === "bar") {
                const base = cy(Math.max(scale.min, 0));
                return (
                  <g key={s.key}>
                    {s.values.map((v, i) => {
                      if (v == null) return null;
                      const top = cy(v);
                      const h = Math.max(1, base - top);
                      const r = Math.min(4, h, barW / 2);
                      const x0 = cx(i) - barW / 2;
                      // rounded data-end, square at the baseline
                      const d = `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`;
                      return (
                        <path
                          key={i}
                          d={d}
                          fill={colorOf(s, i)}
                          opacity={hover == null || hover === i ? 1 : 0.55}
                        />
                      );
                    })}
                  </g>
                );
              }
              const pts = s.values.map((v, i) => (v == null ? null : ([cx(i), cy(v)] as const)));
              if (s.kind === "dots")
                return (
                  <g key={s.key}>
                    {pts.map((p, i) =>
                      p ? (
                        <circle
                          key={i}
                          cx={p[0]}
                          cy={p[1]}
                          r={n > 60 ? 2 : 3}
                          fill={colorOf(s, i)}
                          opacity={0.55}
                        />
                      ) : null,
                    )}
                  </g>
                );
              let d = "";
              let pen = false;
              for (const p of pts) {
                if (!p) {
                  pen = false;
                  continue;
                }
                d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
                pen = true;
              }
              const last = [...pts].reverse().find(Boolean);
              return (
                <g key={s.key}>
                  <path
                    d={d}
                    fill="none"
                    stroke={colorOf(s, 0)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {last ? (
                    <circle
                      cx={last[0]}
                      cy={last[1]}
                      r={4}
                      fill={colorOf(s, 0)}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ) : null}
                </g>
              );
            })}
            {hover != null && !hasBars ? (
              <line
                x1={hx}
                x2={hx}
                y1={M.top}
                y2={M.top + ih}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
              />
            ) : null}
            {hover != null
              ? series
                  .filter((s) => s.kind !== "bar" && s.values[hover] != null)
                  .map((s) => (
                    <circle
                      key={s.key}
                      cx={hx}
                      cy={cy(s.values[hover]!)}
                      r={4}
                      fill={colorOf(s, hover)}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ))
              : null}
          </svg>
          {hover != null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-md border bg-card px-2 py-1.5 text-xs shadow-md"
              style={tipLeft ? { right: width - hx + 10 } : { left: hx + 10 }}
            >
              <p className="font-medium">{xFormat(x[hover]!)}</p>
              {series.map((s) =>
                s.values[hover] != null ? (
                  <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: colorOf(s, hover) }}
                    />
                    <span>{s.label}</span>
                    <span className="ml-auto pl-2 text-foreground tabular-nums">
                      {fmt(s, s.values[hover]!, hover)}
                    </span>
                  </p>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}
