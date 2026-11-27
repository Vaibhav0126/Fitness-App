import { addDays } from "@/lib/engine/dates";
import {
  defaultPlanConfig,
  type PlanConfig,
  planConfigSchema,
  type PlanConfigInput,
} from "@/lib/engine/config";
import type {
  EngineStore,
  FeedbackRow,
  IntervalRow,
  MetricName,
  MetricRow,
  SetRow,
  WorkoutRow,
} from "@/lib/engine/types";

export const TZ = "Asia/Tokyo";

/** 2026-11-18 is a Wednesday. */
export function config(overrides: Partial<PlanConfigInput> = {}): PlanConfig {
  const base = defaultPlanConfig({ timeZone: TZ, planStart: "2026-11-18" });
  return planConfigSchema.parse({ ...base, ...overrides });
}

export function emptyStore(partial: Partial<EngineStore> = {}): EngineStore {
  return { metrics: [], workouts: [], sets: [], feedback: [], exercises: {}, ...partial };
}

/** A Date for local wall-clock time in Tokyo (UTC+9, no DST). */
export function tokyo(date: string, time = "08:00"): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

export function metricSeries(
  name: MetricName,
  end: string,
  values: number[],
  source = "shortcut",
): MetricRow[] {
  return values.map((value, i) => ({ name, value, source, date: addDays(end, i - values.length + 1) }));
}

/** Sets for one exercise in one session. `sets` = [[weight, reps], ...] */
export function sessionSets(
  date: string,
  exercise: string,
  sets: Array<[number | null, number]>,
  opts: { time?: string; title?: string; setType?: (i: number) => string } = {},
): SetRow[] {
  const performedAt = tokyo(date, opts.time ?? "07:00").toISOString();
  return sets.map(([weightKg, reps], i) => ({
    performedAt,
    sessionTitle: opts.title ?? "Session",
    exercise,
    setIndex: i,
    setType: opts.setType?.(i) ?? "normal",
    weightKg,
    reps,
  }));
}

let workoutCounter = 0;
export function runWorkout(
  date: string,
  opts: {
    time?: string;
    id?: string;
    source?: string;
    intervals?: Array<Partial<IntervalRow> & { kind: IntervalRow["kind"] }>;
    avgHr?: number;
    maxHr?: number;
    distanceM?: number;
    durationS?: number;
  } = {},
): WorkoutRow {
  return {
    id: opts.id ?? `run-${workoutCounter++}`,
    source: opts.source ?? "hae",
    type: "run",
    start: tokyo(date, opts.time ?? "06:00").toISOString(),
    durationS: opts.durationS ?? 1800,
    distanceM: opts.distanceM ?? 3000,
    avgHr: opts.avgHr ?? 135,
    maxHr: opts.maxHr ?? 148,
    intervals: (opts.intervals ?? []).map((iv, idx) => ({ idx, ...iv })),
  };
}

export function feedback(date: string, shinPain: number, workoutId?: string): FeedbackRow {
  return { date, shinPain, calfPain: 0, effort: 5, workoutId: workoutId ?? null };
}
