/**
 * The same strength session can arrive from two sources, e.g. a Hevy CSV import and
 * later the Hevy API. Sessions from different sources that start within two minutes of
 * each other are treated as one, and the higher-priority source is kept. Nothing is
 * deleted: this runs when the engine's store is loaded.
 */
export const STRENGTH_SOURCE_PRIORITY = ["hevy", "manual", "csv_hevy", "csv_strong", "csv", "demo"] as const;

export const SAME_SESSION_MS = 2 * 60_000;

const rank = (source: string) => {
  const i = (STRENGTH_SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return i === -1 ? STRENGTH_SOURCE_PRIORITY.length : i;
};

export const sessionKey = (source: string, start: Date) => `${source}|${start.getTime()}`;

/** Returns the `${source}|${startMs}` keys of sessions to drop. */
export function duplicateStrengthSessions(sets: Array<{ source: string; performedAt: Date }>): Set<string> {
  const sessions = new Map<string, { source: string; t: number }>();
  for (const s of sets)
    sessions.set(sessionKey(s.source, s.performedAt), { source: s.source, t: s.performedAt.getTime() });
  if (new Set([...sessions.values()].map((s) => s.source)).size < 2) return new Set();
  const ordered = [...sessions.entries()].sort(
    ([, a], [, b]) => rank(a.source) - rank(b.source) || a.source.localeCompare(b.source) || a.t - b.t,
  );
  const kept: Array<{ source: string; t: number }> = [];
  const drop = new Set<string>();
  for (const [key, s] of ordered) {
    if (kept.some((k) => k.source !== s.source && Math.abs(k.t - s.t) <= SAME_SESSION_MS)) drop.add(key);
    else kept.push(s);
  }
  return drop;
}
