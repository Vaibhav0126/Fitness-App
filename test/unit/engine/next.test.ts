import { describe, expect, it } from "vitest";
import { computeState } from "@/lib/engine";
import { config, emptyStore, metricSeries, runWorkout, sessionSets, tokyo } from "../../helpers/engine";

// Schedule: Sun rest, Mon Lower A, Tue Upper A, Wed run, Thu Lower B, Fri Upper B, Sat run.
const cfg = config();

describe("next workout", () => {
  it("before noon shows today's planned session", () => {
    const s = computeState(emptyStore(), cfg, tokyo("2026-11-23", "09:00")); // Monday
    expect(s.next).toMatchObject({ date: "2026-11-23", kind: "strength", title: "Lower A" });
    expect(s.next?.strength?.exercises).toHaveLength(7);
  });

  it("at or after 12:00 shows tomorrow's", () => {
    expect(computeState(emptyStore(), cfg, tokyo("2026-11-23", "12:00")).next?.date).toBe("2026-11-24");
    expect(computeState(emptyStore(), cfg, tokyo("2026-11-23", "11:59")).next?.date).toBe("2026-11-23");
  });

  it("when today's session is logged, shows the next one", () => {
    const sets = sessionSets("2026-11-23", "Squat (Barbell)", [[100, 5]], { time: "07:00" });
    const s = computeState(emptyStore({ sets }), cfg, tokyo("2026-11-23", "09:00"));
    expect(s.next).toMatchObject({ date: "2026-11-24", title: "Upper A" });
  });

  it("skips rest days", () => {
    // Saturday afternoon → Sunday is rest → Monday
    expect(computeState(emptyStore(), cfg, tokyo("2026-11-28", "15:00")).next?.date).toBe("2026-11-30");
  });

  it("run days get the run-walk prescription for the current plan week", () => {
    const s = computeState(emptyStore(), cfg, tokyo("2026-11-25", "07:00")); // Wednesday
    expect(s.next?.run).toMatchObject({ week: 1, reps: 8, runS: 60, walkS: 120, runInWeek: 1 });
    expect(s.next?.title).toBe("Run: Week 1 (8 × 1:00 run / 2:00 walk)");
  });

  it("uses the hotel routine on trip dates", () => {
    const trip = config({ trips: [{ from: "2026-11-23", to: "2026-11-24", label: "Tokyo" }] });
    const s = computeState(emptyStore(), trip, tokyo("2026-11-23", "08:00"));
    expect(s.next?.strength).toMatchObject({ hotel: true, routine: "Hotel routine" });
    expect(s.next?.items[0]?.title).toBe("Travelling: Tokyo");
  });

  it("strength+run days include both parts", () => {
    const c = config({ schedule: { ...cfg.schedule, "1": { kind: "strength+run", routine: "Lower A" } } });
    const s = computeState(emptyStore(), c, tokyo("2026-11-23", "08:00"));
    expect(s.next?.kind).toBe("strength+run");
    expect(s.next?.strength?.routine).toBe("Lower A");
    expect(s.next?.run?.week).toBe(1);
  });

  it("low readiness switches to easy mode", () => {
    const today = "2026-11-23";
    const metrics = [
      ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 50, 35]),
      ...metricSeries("resting_hr", today, [55, 55, 55, 55, 62]),
      ...metricSeries("sleep_hours", today, [7, 7, 7, 7, 7]),
    ];
    const sets = sessionSets("2026-11-16", "Squat (Barbell)", [
      [100, 8],
      [100, 8],
      [100, 8],
    ]);
    const s = computeState(emptyStore({ metrics, sets }), cfg, tokyo(today, "08:00"));
    expect(s.today.readiness).toBe("low");
    expect(s.next?.easy).toBe(true);
    expect(s.next?.strength?.exercises[0]).toMatchObject({ action: "easy", sets: 2, weightKg: 100 });
  });

  it("prompts for shin feedback when the last run has none", () => {
    const workouts = [runWorkout("2026-11-21", { id: "sat" })];
    const s = computeState(emptyStore({ workouts }), cfg, tokyo("2026-11-25", "07:00"));
    expect(s.next?.items.find((i) => i.id === "next.run.feedback")?.action).toMatchObject({
      workoutId: "sat",
    });
  });
});

describe("today", () => {
  it("is deterministic for the same inputs", () => {
    const now = tokyo("2026-11-25", "07:00");
    const store = emptyStore({ workouts: [runWorkout("2026-11-25", { time: "06:00" })] });
    expect(computeState(store, cfg, now)).toEqual(computeState(store, cfg, now));
  });

  it("rest-day and no-session insights", () => {
    expect(
      computeState(emptyStore(), cfg, tokyo("2026-11-29", "09:00")).today.insights.some(
        (i) => i.id === "today.rest",
      ),
    ).toBe(true);
    expect(
      computeState(emptyStore(), cfg, tokyo("2026-11-23", "10:30")).today.insights.some(
        (i) => i.id === "today.none",
      ),
    ).toBe(true);
    expect(
      computeState(emptyStore(), cfg, tokyo("2026-11-23", "09:30")).today.insights.some(
        (i) => i.id === "today.none",
      ),
    ).toBe(false);
  });

  it("compares today's lifting with last time", () => {
    const sets = [
      ...sessionSets("2026-11-16", "Squat (Barbell)", [[100, 5]]),
      ...sessionSets("2026-11-23", "Squat (Barbell)", [[102.5, 5]]),
    ];
    const s = computeState(emptyStore({ sets }), cfg, tokyo("2026-11-23", "09:00"));
    expect(s.today.insights.find((i) => i.id === "today.strength")?.text).toMatch(
      /Up from last time: Squat 102\.5×5/,
    );
  });

  it("every insight has id, severity, title, text and evidence", () => {
    const today = "2026-11-25";
    const store = emptyStore({
      metrics: [
        ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 50]),
        ...metricSeries("steps", today, [9000]),
      ],
      workouts: [runWorkout(today, { intervals: [{ kind: "run", avgSpeedKmh: 8, maxHr: 140 }] })],
    });
    for (const i of computeState(store, cfg, tokyo(today, "09:00")).today.insights) {
      expect(i).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          severity: expect.stringMatching(/info|good|warn/),
          title: expect.any(String),
          text: expect.any(String),
          evidence: expect.any(Array),
        }),
      );
    }
  });
});
