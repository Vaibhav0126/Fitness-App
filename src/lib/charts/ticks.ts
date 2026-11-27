/**
 * "Nice" axis ticks (Heckbert, Graphics Gems 1990): steps of 1, 2, 2.5 or 5 × 10^k,
 * with the domain expanded to whole steps so the axis starts and ends on a tick.
 */
export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** Decimal places needed to print `step` without float noise. */
export function stepDecimals(step: number): number {
  const s = String(Number(step.toPrecision(12)));
  return s.includes(".") ? s.split(".")[1]!.length : 0;
}

export function niceScale(lo: number, hi: number, maxTicks = 5, opts: { zero?: boolean } = {}): NiceScale {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  if (opts.zero) lo = Math.min(0, lo);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
    if (opts.zero && lo < 0 && hi > 0 && lo + pad >= 0) lo = 0;
  }
  const range = niceNum(hi - lo, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const d = stepDecimals(step);
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(d)));
  return { min: Number(min.toFixed(d)), max: Number(max.toFixed(d)), step, ticks };
}

/** Evenly spaced indices for x labels, always including the first and last. */
export function labelIndices(n: number, max = 6): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  return [...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step)))];
}
