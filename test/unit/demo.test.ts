import { describe, expect, it } from "vitest";
import { computeState } from "@/lib/engine";
import { addDays, isoWeekStart } from "@/lib/engine/dates";
import { generateDemoData } from "@/lib/demo/generate";
import { DEMO_TIME_ZONE } from "@/lib/demo/constants";
import { assertWritable, DemoReadOnlyError } from "@/server/dal";

const now = new Date("2026-11-27T10:00:00Z");

describe("demo data generator", () => {
  const d = generateDemoData(now);

  it("is deterministic for the same anchor", () => {
    expect(generateDemoData(now)).toEqual(d);
  });

  it("covers 12 weeks of 4-day lifting and 2 runs per week", () => {
    const sessions = new Set(d.sets.map((s) => s.performedAt));
    expect(sessions.size).toBeGreaterThanOrEqual(40);
    expect(sessions.size).toBeLessThanOrEqual(48);
    const firstDay = d.metrics[0]!.date;
    expect(firstDay).toBe(addDays(isoWeekStart("2026-11-27"), -77));
    expect(d.workouts.filter((w) => w.type === "run").length).toBeGreaterThanOrEqual(10);
    expect(d.config.timeZone).toBe(DEMO_TIME_ZONE);
    expect(d.config.trips).toHaveLength(1);
  });

  it("shows progression, a bad-recovery week, a trip and a repeated run week", () => {
    const squat = d.sets.filter((s) => s.exerciseRaw === "Squat (Barbell)" && s.setType === "normal");
    expect(squat.at(-1)!.weightKg!).toBeGreaterThan(squat[0]!.weightKg!);
    const hrv = d.metrics.filter((m) => m.name === "hrv_sdnn_ms").map((m) => m.value);
    expect(Math.min(...hrv)).toBeLessThan(45);
    expect(d.sets.some((s) => s.sessionTitle === "Hotel routine")).toBe(true);
    expect(d.feedback.some((f) => f.shinPain > 3)).toBe(true);
    const state = computeState(
      {
        metrics: d.metrics.map((m) => ({ ...m, source: "demo" })),
        workouts: d.workouts.map((w, i) => ({
          ...w,
          id: `w${i}`,
          source: "demo",
          intervals: w.intervals ?? [],
        })),
        sets: d.sets.map((s) => ({ ...s, exercise: s.exerciseRaw })),
        feedback: [],
        exercises: {},
      },
      d.config,
      now,
    );
    expect(state.plan.week).toBeGreaterThanOrEqual(4);
    expect(state.next).not.toBeNull();
  });
});

describe("demo write block", () => {
  it("rejects writes for the demo user", () => {
    expect(() => assertWritable({ isDemo: true })).toThrow(DemoReadOnlyError);
    expect(() => assertWritable({ isDemo: false })).not.toThrow();
    expect(() => assertWritable({})).not.toThrow();
  });
});
