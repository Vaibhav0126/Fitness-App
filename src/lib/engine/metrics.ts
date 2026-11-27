import { addDays } from "./dates";
import type { MetricName, MetricRow } from "./types";

/**
 * When several sources report the same metric for the same day, the earliest entry
 * here wins. Unknown sources rank after all known ones (alphabetically, for determinism).
 */
export const SOURCE_PRIORITY = ["manual", "shortcut", "hae", "apple_health", "demo"] as const;

const rank = (source: string): number => {
  const i = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return i === -1 ? SOURCE_PRIORITY.length : i;
};

/** One value per (date, name), chosen by source priority. */
export function resolveMetrics(rows: MetricRow[]): Map<MetricName, Map<string, number>> {
  const best = new Map<string, MetricRow>();
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    const key = `${r.name}|${r.date}`;
    const cur = best.get(key);
    if (
      !cur ||
      rank(r.source) < rank(cur.source) ||
      (rank(r.source) === rank(cur.source) && r.source < cur.source)
    ) {
      best.set(key, r);
    }
  }
  const out = new Map<MetricName, Map<string, number>>();
  for (const r of best.values()) {
    let m = out.get(r.name);
    if (!m) out.set(r.name, (m = new Map()));
    m.set(r.date, r.value);
  }
  return out;
}

export interface Point {
  date: string;
  v: number;
}

/** Points with date in (today − days, today], ascending. Future-dated rows never count. */
export function series(
  metrics: Map<MetricName, Map<string, number>>,
  name: MetricName,
  today: string,
  days: number,
): Point[] {
  const m = metrics.get(name);
  if (!m) return [];
  const from = addDays(today, -days);
  return [...m.entries()]
    .filter(([d]) => d <= today && d > from)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, v }));
}

export const mean = (a: number[]): number | null =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

/** Trailing rolling mean over the previous `window` points (including the current one). */
export function rolling(points: Point[], window = 7): Array<Point & { avg: number }> {
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1).map((x) => x.v);
    return { ...p, avg: Math.round((mean(slice) ?? p.v) * 10) / 10 };
  });
}
