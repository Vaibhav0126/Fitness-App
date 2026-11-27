/**
 * Parity with reference/engine.js: the behavioural oracle. Each scenario is one where
 * the approved spec rules match the reference's behaviour (docs/engine.md lists where
 * they intentionally differ). Inputs are translated into the reference's store/config shapes.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeState } from "@/lib/engine";
import type { PlanConfig } from "@/lib/engine/config";
import { fmtMmSs } from "@/lib/engine/dates";
import type { EngineStore } from "@/lib/engine/types";
import {
  config,
  emptyStore,
  feedback,
  metricSeries,
  runWorkout,
  sessionSets,
  tokyo,
} from "../../helpers/engine";

interface RefState {
  today: { readiness: string };
  next: {
    date: string;
    title?: string;
    exercises?: Array<{ exercise: string; target: string; up?: boolean }>;
  };
  plan: { week: number; runsThisWeek: number };
}
interface RefModule {
  computeState(store: unknown, nowMs: number, cfg: unknown): RefState;
}

const refPath = path.resolve(import.meta.dirname, "../../../reference/engine.js");
const ref = (await import(refPath)) as RefModule;

function toRefConfig(cfg: PlanConfig) {
  const typeOf = (k: string) => (k === "strength" ? "lift" : k);
  return {
    tzOffsetMin: 9 * 60, // Asia/Tokyo, no DST
    planStart: cfg.planStart,
    schedule: Object.fromEntries(
      Object.entries(cfg.schedule).map(([d, s]) => [d, { type: typeOf(s.kind), routine: s.routine }]),
    ),
    runPlan: cfg.runPlan.map((w) => ({
      week: w.week,
      reps: w.reps,
      run: fmtMmSs(w.runS),
      walk: fmtMmSs(w.walkS),
      note: w.note,
    })),
    runTargets: {
      speed: [cfg.runTargets.speedKmhMin, cfg.runTargets.speedKmhMax],
      hrCap: cfg.runTargets.hrCap,
      cadence: [cfg.runTargets.cadenceMin, cfg.runTargets.cadenceMax],
      shinMax: cfg.progression.shinMax,
    },
    routines: cfg.routines,
    hotelRoutine: [],
    trips: [],
    keyLifts: cfg.keyLifts,
    goals: [],
  };
}

function toRefStore(store: EngineStore) {
  const metricMap: Record<string, string> = {
    hrv_sdnn_ms: "heart_rate_variability",
    resting_hr: "resting_heart_rate",
    sleep_hours: "sleep_analysis",
    steps: "step_count",
  };
  const metrics: Record<string, Record<string, unknown>> = {};
  for (const m of store.metrics) {
    const name = metricMap[m.name];
    if (!name) continue;
    (metrics[name] ??= {})[m.date] = m.name === "sleep_hours" ? { hours: m.value } : m.value;
  }
  const localDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
  const workouts = Object.fromEntries(
    store.workouts.map((w) => [
      w.id,
      {
        isRun: w.type === "run",
        isStrength: w.type === "strength",
        ms: Date.parse(w.start),
        date: localDate(w.start),
        avgHr: w.avgHr,
        maxHr: w.maxHr,
        intervals: w.intervals.map((i) => ({
          kind: i.kind,
          speedKmh: i.avgSpeedKmh,
          maxHr: i.maxHr,
          cadence: i.cadence,
        })),
      },
    ]),
  );
  const sets = store.sets.map((s) => ({
    exercise: s.exercise,
    start: s.performedAt,
    date: localDate(s.performedAt),
    weight: s.weightKg ?? 0,
    reps: s.reps ?? 0,
    workout: s.sessionTitle,
  }));
  const fb = Object.fromEntries(store.feedback.map((f) => [f.date, { shins: f.shinPain }]));
  return { metrics, workouts, sets, feedback: fb };
}

function both(store: EngineStore, cfg: PlanConfig, now: Date) {
  return {
    ours: computeState(store, cfg, now),
    theirs: ref.computeState(toRefStore(store), now.getTime(), toRefConfig(cfg)),
  };
}

const cfg = config();

describe("parity with reference/engine.js", () => {
  it("next-workout day selection (noon rule, rest-day skip)", () => {
    for (const [date, time] of [
      ["2026-11-23", "09:00"],
      ["2026-11-23", "13:00"],
      ["2026-11-28", "15:00"],
      ["2026-11-29", "08:00"],
      ["2026-11-25", "11:59"],
    ] as const) {
      const { ours, theirs } = both(emptyStore(), cfg, tokyo(date, time));
      expect(ours.next?.date, `${date} ${time}`).toBe(theirs.next.date);
    }
  });

  it("weighted progression: increase vs repeat (no back-off sets, best+1 ≥ repLo)", () => {
    const sets = [
      ...sessionSets("2026-11-16", "Squat (Barbell)", [
        [100, 8],
        [100, 8],
        [100, 8],
      ]),
      ...sessionSets("2026-11-16", "Leg Press (Machine)", [
        [150, 11],
        [150, 10],
      ]),
      ...sessionSets("2026-11-16", "Seated Leg Curl (Machine)", [
        [50, 15],
        [50, 15],
      ]),
    ];
    const { ours, theirs } = both(emptyStore({ sets }), cfg, tokyo("2026-11-23", "08:00"));
    const pick = (ex: string) => theirs.next.exercises?.find((e) => e.exercise === ex);
    const mine = (ex: string) => ours.next?.strength?.exercises.find((e) => e.exercise === ex);

    expect(pick("Squat (Barbell)")?.up).toBe(true);
    expect(pick("Squat (Barbell)")?.target).toMatch(new RegExp(`^${mine("Squat (Barbell)")?.weightKg} kg`));
    expect(mine("Squat (Barbell)")?.action).toBe("increase");

    expect(pick("Leg Press (Machine)")?.up).toBeUndefined();
    expect(pick("Leg Press (Machine)")?.target).toBe(
      `150 kg × 2 × ${mine("Leg Press (Machine)")?.targetReps}`,
    );

    expect(pick("Seated Leg Curl (Machine)")?.up).toBe(true);
    expect(mine("Seated Leg Curl (Machine)")?.weightKg).toBe(52.5);
  });

  it("easy mode drops one set and keeps the weight", () => {
    const today = "2026-11-23";
    const metrics = [
      ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 50, 35]),
      ...metricSeries("resting_hr", today, [55, 55, 55, 55, 62]),
      ...metricSeries("sleep_hours", today, [7, 7, 7, 7, 7]),
    ];
    const sets = sessionSets("2026-11-16", "Squat (Barbell)", [
      [100, 6],
      [100, 6],
      [100, 6],
    ]);
    const { ours, theirs } = both(emptyStore({ metrics, sets }), cfg, tokyo(today, "08:00"));
    expect(theirs.today.readiness).toBe("low");
    expect(ours.today.readiness).toBe("low");
    expect(theirs.next.exercises?.[0]?.target).toBe(
      `100 kg × ${ours.next?.strength?.exercises[0]?.sets} × 6`,
    );
  });

  it("readiness level when all three signals are present", () => {
    const today = "2026-11-27";
    for (const [hrv, rhr, sleep] of [
      [50, 55, 7],
      [40, 55, 7],
      [40, 62, 7],
      [50, 55, 5],
      [40, 62, 5],
    ]) {
      const metrics = [
        ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 50, hrv!]),
        ...metricSeries("resting_hr", today, [55, 55, 55, 55, rhr!]),
        ...metricSeries("sleep_hours", today, [7, 7, 7, 7, sleep!]),
      ];
      const { ours, theirs } = both(emptyStore({ metrics }), cfg, tokyo(today, "08:00"));
      expect(ours.today.readiness, `${hrv}/${rhr}/${sleep}`).toBe(theirs.today.readiness);
    }
  });

  it("run-plan week and count, including a shin-pain repeat", () => {
    const dates = [
      "2026-11-18",
      "2026-11-21",
      "2026-11-25",
      "2026-11-28",
      "2026-12-02",
      "2026-12-05",
      "2026-12-09",
    ];
    const workouts = dates.map((d) => runWorkout(d, { id: d }));
    for (const fb of [
      [],
      [feedback("2026-11-28", 6)],
      [feedback("2026-12-05", 4), feedback("2026-11-18", 2)],
    ]) {
      const { ours, theirs } = both(
        emptyStore({ workouts, feedback: fb }),
        cfg,
        tokyo("2026-12-10", "08:00"),
      );
      expect(ours.plan.week).toBe(theirs.plan.week);
      expect(ours.plan.runsThisWeek).toBe(theirs.plan.runsThisWeek);
    }
  });
});
