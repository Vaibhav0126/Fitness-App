import { addDays, isoWeekStart } from "./dates";
import type { PlanConfig } from "./config";
import type { Run } from "./runs";
import { exerciseMeta, type Session, workingSets } from "./strength";
import type { ExerciseMeta, Insight } from "./types";

export const VOLUME_MIN_SETS = 10;
export const VOLUME_MAX_SETS = 22;

export interface WeekVolume {
  /** Monday, YYYY-MM-DD */
  week: string;
  /** muscle group → working sets */
  groups: Record<string, number>;
  sets: number;
  sessions: number;
  runs: number;
}

export function weeklyVolume(
  byExercise: Map<string, Session[]>,
  runs: Run[],
  exercises: Record<string, ExerciseMeta>,
): WeekVolume[] {
  const weeks = new Map<
    string,
    { groups: Record<string, number>; sets: number; sessions: Set<string>; runs: number }
  >();
  const get = (wk: string) => {
    let w = weeks.get(wk);
    if (!w) weeks.set(wk, (w = { groups: {}, sets: 0, sessions: new Set(), runs: 0 }));
    return w;
  };
  for (const [ex, sessions] of byExercise) {
    const group = exerciseMeta(ex, exercises).muscleGroup ?? "other";
    for (const s of sessions) {
      const n = workingSets(s.sets).length;
      if (!n) continue;
      const w = get(isoWeekStart(s.date));
      w.groups[group] = (w.groups[group] ?? 0) + n;
      w.sets += n;
      w.sessions.add(s.start);
    }
  }
  for (const r of runs) get(isoWeekStart(r.date)).runs++;
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, w]) => ({ week, groups: w.groups, sets: w.sets, sessions: w.sessions.size, runs: w.runs }));
}

/**
 * Flags muscle groups trained by the plan's routines whose working sets in the last
 * complete ISO week were under 10 or over 22. The current, partial week is never flagged.
 */
export function volumeFlags(
  weeks: WeekVolume[],
  cfg: PlanConfig,
  exercises: Record<string, ExerciseMeta>,
  today: string,
): Insight[] {
  const lastWeek = addDays(isoWeekStart(today), -7);
  const w = weeks.find((x) => x.week === lastWeek);
  if (!w || w.sets === 0) return [];
  const planned = new Set<string>();
  for (const items of Object.values(cfg.routines)) {
    for (const [ex] of items) {
      const g = exerciseMeta(ex, exercises).muscleGroup;
      if (g) planned.add(g);
    }
  }
  const low: string[] = [];
  const high: string[] = [];
  for (const g of [...planned].sort()) {
    const n = w.groups[g] ?? 0;
    if (n < VOLUME_MIN_SETS) low.push(`${g} ${n}`);
    else if (n > VOLUME_MAX_SETS) high.push(`${g} ${n}`);
  }
  // One insight per direction, listing every group, so a light template doesn't flood Today.
  const out: Insight[] = [];
  const range = `Range ${VOLUME_MIN_SETS}–${VOLUME_MAX_SETS} working sets per muscle group per week`;
  if (high.length)
    out.push({
      id: "volume.high",
      severity: "warn",
      title: "High weekly volume",
      text: `Over ${VOLUME_MAX_SETS} working sets last week: ${high.join(", ")}. Consider trimming a set or two.`,
      evidence: [`Week of ${lastWeek}`, ...high.map((h) => `${h} sets`), range],
    });
  if (low.length)
    out.push({
      id: "volume.low",
      severity: "info",
      title: "Low weekly volume",
      text: `Under ${VOLUME_MIN_SETS} working sets last week: ${low.join(", ")}.`,
      evidence: [`Week of ${lastWeek}`, ...low.map((l) => `${l} sets`), range],
    });
  return out;
}
