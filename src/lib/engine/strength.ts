import { fmtDay, localDate } from "./dates";
import type { PlanConfig, RoutineItem } from "./config";
import type { ExerciseMeta, SetRow } from "./types";

/*
 * Strength rules (spec §6.2). See docs/engine.md for examples.
 */

export const WARMUP_FRACTION = 0.6;
export const E1RM_MAX_REPS = 12;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Epley e1RM; only defined for 1–12 reps with a positive load. */
export function e1rm(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > E1RM_MAX_REPS) return null;
  return r1(weightKg * (1 + reps / 30));
}

export function exerciseMeta(name: string, exercises: Record<string, ExerciseMeta>): Required<ExerciseMeta> {
  const m = exercises[name];
  return {
    muscleGroup: m?.muscleGroup ?? null,
    isDumbbell: m?.isDumbbell ?? /dumbbell/i.test(name),
    isBodyweight: m?.isBodyweight ?? false,
  };
}

export interface Session {
  /** Session start (ISO instant), the grouping key */
  start: string;
  /** Local calendar date of the session */
  date: string;
  title: string | null;
  sets: SetRow[];
}

/** exercise → sessions (ascending by start), excluding sets after `now`. */
export function sessionsByExercise(sets: SetRow[], timeZone: string, now: Date): Map<string, Session[]> {
  const nowMs = now.getTime();
  const map = new Map<string, Map<string, Session>>();
  for (const s of sets) {
    if (!s.exercise || Date.parse(s.performedAt) > nowMs) continue;
    let byStart = map.get(s.exercise);
    if (!byStart) map.set(s.exercise, (byStart = new Map()));
    let sess = byStart.get(s.performedAt);
    if (!sess) {
      sess = {
        start: s.performedAt,
        date: localDate(s.performedAt, timeZone),
        title: s.sessionTitle ?? null,
        sets: [],
      };
      byStart.set(s.performedAt, sess);
    }
    sess.sets.push(s);
  }
  const out = new Map<string, Session[]>();
  for (const [ex, byStart] of map) {
    const list = [...byStart.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    for (const sess of list) sess.sets.sort((a, b) => a.setIndex - b.setIndex);
    out.set(ex, list);
  }
  return out;
}

/**
 * Working sets of one exercise in one session: drops explicit warm-ups, sets without reps,
 * and (when the session has a positive top weight) sets under 60% of that top weight.
 */
export function workingSets(sets: SetRow[]): SetRow[] {
  const withReps = sets.filter((s) => (s.reps ?? 0) > 0 && s.setType !== "warmup");
  const top = Math.max(0, ...withReps.map((s) => s.weightKg ?? 0));
  if (top <= 0) return withReps;
  return withReps.filter((s) => (s.weightKg ?? 0) >= WARMUP_FRACTION * top);
}

export interface Performance {
  date: string;
  start: string;
  working: SetRow[];
  topWeightKg: number;
  /** Best working set by e1RM (falls back to the heaviest-then-most-reps set). */
  best: SetRow;
  bestE1rm: number | null;
}

export function performance(session: Session): Performance | null {
  const working = workingSets(session.sets);
  if (!working.length) return null;
  const topWeightKg = Math.max(0, ...working.map((s) => s.weightKg ?? 0));
  let best = working[0]!;
  let bestE1rm = e1rm(best.weightKg, best.reps);
  for (const s of working.slice(1)) {
    const e = e1rm(s.weightKg, s.reps);
    const better =
      e != null && bestE1rm != null
        ? e > bestE1rm
        : e != null
          ? true
          : bestE1rm == null &&
            ((s.weightKg ?? 0) > (best.weightKg ?? 0) ||
              ((s.weightKg ?? 0) === (best.weightKg ?? 0) && (s.reps ?? 0) > (best.reps ?? 0)));
    if (better) {
      best = s;
      bestE1rm = e;
    }
  }
  return { date: session.date, start: session.start, working, topWeightKg, best, bestE1rm };
}

export function lastPerformance(
  sessions: Session[] | undefined,
  beforeStartMs = Infinity,
): Performance | null {
  if (!sessions) return null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]!;
    if (Date.parse(s.start) >= beforeStartMs) continue;
    const p = performance(s);
    if (p) return p;
  }
  return null;
}

export type PrescriptionAction = "find-weight" | "increase" | "repeat" | "easy" | "reps" | "add-load";

export interface Prescription {
  exercise: string;
  sets: number;
  repLo: number;
  repHi: number;
  /** null for bodyweight or unknown */
  weightKg: number | null;
  /** null = the whole range (no history / add load) */
  targetReps: number | null;
  action: PrescriptionAction;
  target: string;
  note: string;
  evidence: string[];
  last: { date: string; sets: Array<{ weightKg: number | null; reps: number | null }> } | null;
}

const fmtSet = (s: SetRow, bw: boolean) =>
  bw || !s.weightKg ? `${s.reps ?? "?"}` : `${s.weightKg}×${s.reps ?? "?"}`;

export function prescribe(
  item: RoutineItem,
  last: Performance | null,
  opts: { easy: boolean; meta: Required<ExerciseMeta>; progression: PlanConfig["progression"] },
): Prescription {
  const [exercise, nSets, lo, hi] = item;
  const { easy, meta, progression } = opts;
  const sets = easy ? Math.max(1, nSets - 1) : nSets;

  if (!last) {
    return {
      exercise,
      sets,
      repLo: lo,
      repHi: hi,
      weightKg: null,
      targetReps: null,
      action: "find-weight",
      target: `${sets} × ${lo}–${hi}`,
      note: "Find a working weight: start light, stop 2–3 reps short of failure.",
      evidence: ["No previous session with working sets"],
      last: null,
    };
  }

  const bw = meta.isBodyweight || last.topWeightKg <= 0;
  const reps = last.working.map((s) => s.reps ?? 0);
  const allHitTop = reps.every((r) => r >= hi);
  const lastSummary = {
    date: last.date,
    sets: last.working.map((s) => ({ weightKg: s.weightKg ?? null, reps: s.reps ?? null })),
  };
  const lastTxt = `Last (${fmtDay(last.date)}): ${last.working.map((s) => fmtSet(s, bw)).join(", ")}`;
  const evidence = [lastTxt, `Rep range ${lo}–${hi}`, `Working sets: ${last.working.length}`];

  if (bw) {
    const atTop = last.working.filter((s) => (s.weightKg ?? 0) === last.topWeightKg).map((s) => s.reps ?? 0);
    const best = Math.max(...atTop);
    if (easy) {
      const t = Math.min(hi, best);
      return {
        exercise,
        sets,
        repLo: lo,
        repHi: hi,
        weightKg: null,
        targetReps: t,
        action: "easy",
        target: `${sets} × ${t}`,
        note: `${lastTxt}. Easier day: one set fewer, no extra reps.`,
        evidence: [...evidence, "Readiness is low"],
        last: lastSummary,
      };
    }
    if (allHitTop) {
      return {
        exercise,
        sets,
        repLo: lo,
        repHi: hi,
        weightKg: null,
        targetReps: lo,
        action: "add-load",
        target: `${sets} × ${lo}–${hi} with added load`,
        note: `${lastTxt}. You hit ${hi}+ on every set. Add a little load (hold a dumbbell or use a vest) and start again at ${lo} reps.`,
        evidence: [...evidence, `Every working set reached ${hi}`],
        last: lastSummary,
      };
    }
    const t = Math.min(hi, best + 1);
    return {
      exercise,
      sets,
      repLo: lo,
      repHi: hi,
      weightKg: null,
      targetReps: t,
      action: "reps",
      target: `${sets} × ${t}`,
      note: `${lastTxt}. Add a rep: aim for ${t}.`,
      evidence,
      last: lastSummary,
    };
  }

  const topW = last.topWeightKg;
  const atTop = last.working.filter((s) => (s.weightKg ?? 0) === topW).map((s) => s.reps ?? 0);
  const best = Math.max(...atTop);

  if (easy) {
    const t = Math.min(hi, best);
    return {
      exercise,
      sets,
      repLo: lo,
      repHi: hi,
      weightKg: topW,
      targetReps: t,
      action: "easy",
      target: `${topW} kg × ${sets} × ${t}`,
      note: `${lastTxt}. Easier day: same weight, one set fewer, no increase.`,
      evidence: [...evidence, "Readiness is low"],
      last: lastSummary,
    };
  }
  if (allHitTop) {
    const step = meta.isDumbbell ? progression.dumbbellStepKg : progression.weightStepKg;
    const w = r1(topW + step);
    return {
      exercise,
      sets,
      repLo: lo,
      repHi: hi,
      weightKg: w,
      targetReps: lo,
      action: "increase",
      target: `${w} kg × ${sets} × ${lo}`,
      note: `${lastTxt}. You hit ${hi}+ on every working set, so add ${step} kg and restart at ${lo} reps.`,
      evidence: [...evidence, `Every working set reached ${hi}`, `Step: +${step} kg`],
      last: lastSummary,
    };
  }
  const t = Math.min(hi, best + 1);
  return {
    exercise,
    sets,
    repLo: lo,
    repHi: hi,
    weightKg: topW,
    targetReps: t,
    action: "repeat",
    target: `${topW} kg × ${sets} × ${t}`,
    note: `${lastTxt}. Same weight. Aim for ${t} reps before adding weight.`,
    evidence: [...evidence, `Best set at ${topW} kg: ${best} reps`],
    last: lastSummary,
  };
}

export interface LiftTrend {
  exercise: string;
  points: Array<{ date: string; e1rm: number; top: string; topWeightKg: number }>;
}

export function liftTrend(exercise: string, sessions: Session[] | undefined): LiftTrend {
  const points: LiftTrend["points"] = [];
  for (const s of sessions ?? []) {
    const p = performance(s);
    if (!p || p.bestE1rm == null) continue;
    points.push({
      date: p.date,
      e1rm: p.bestE1rm,
      top: `${p.best.weightKg}×${p.best.reps}`,
      topWeightKg: p.topWeightKg,
    });
  }
  return { exercise, points };
}

export interface GoalProgress {
  exercise: string;
  weightKg?: number;
  reps: number;
  label: string;
  /** e1RM-based when the goal is ≤12 reps with a load; otherwise volume-at-goal-reps based. */
  method: "e1rm" | "reps";
  current: number | null;
  target: number;
  pct: number;
  best: string;
}

export function goalProgress(
  goal: PlanConfig["goals"][number],
  sessions: Session[] | undefined,
): GoalProgress {
  const last = lastPerformance(sessions);
  const label = goal.weightKg
    ? `${goal.exercise.replace(/ \(.*\)/, "")} ${goal.weightKg} × ${goal.reps}`
    : `${goal.exercise.replace(/ \(.*\)/, "")} × ${goal.reps}`;
  const best = last ? `${last.best.weightKg ?? 0}×${last.best.reps ?? 0}` : "—";
  const targetE1 = e1rm(goal.weightKg, goal.reps);
  if (targetE1 != null) {
    const cur = last?.bestE1rm ?? null;
    return {
      ...goal,
      label,
      method: "e1rm",
      current: cur,
      target: targetE1,
      best,
      pct: cur ? Math.min(100, Math.round((cur / targetE1) * 100)) : 0,
    };
  }
  // High-rep or bodyweight goal: score each working set as load×min(reps, goalReps).
  const gw = goal.weightKg && goal.weightKg > 0 ? goal.weightKg : 1;
  const score = (w: number, r: number) => (goal.weightKg ? w : 1) * Math.min(r, goal.reps);
  const target = gw * goal.reps;
  const cur = last ? Math.max(...last.working.map((s) => score(s.weightKg ?? 0, s.reps ?? 0))) : null;
  return {
    ...goal,
    label,
    method: "reps",
    current: cur,
    target,
    best,
    pct: cur ? Math.min(100, Math.round((cur / target) * 100)) : 0,
  };
}
