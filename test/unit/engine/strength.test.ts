import { describe, expect, it } from "vitest";
import {
  e1rm,
  exerciseMeta,
  goalProgress,
  lastPerformance,
  prescribe,
  sessionsByExercise,
  workingSets,
} from "@/lib/engine/strength";
import type { SetRow } from "@/lib/engine/types";
import { sessionSets, TZ, tokyo } from "../../helpers/engine";

const progression = { weightStepKg: 2.5, dumbbellStepKg: 2, shinMax: 3, runsPerWeek: 2 };
const now = tokyo("2026-11-27", "09:00");

function rx(
  sets: SetRow[],
  item: [string, number, number, number],
  opts: { easy?: boolean; bodyweight?: boolean } = {},
) {
  const by = sessionsByExercise(sets, TZ, now);
  const meta = exerciseMeta(item[0], opts.bodyweight ? { [item[0]]: { isBodyweight: true } } : {});
  return prescribe(item, lastPerformance(by.get(item[0])), { easy: opts.easy ?? false, meta, progression });
}

describe("e1RM", () => {
  it("uses Epley for 1–12 reps only", () => {
    expect(e1rm(100, 5)).toBe(116.7);
    expect(e1rm(100, 12)).toBe(140);
    expect(e1rm(100, 13)).toBeNull();
    expect(e1rm(0, 5)).toBeNull();
    expect(e1rm(null, 5)).toBeNull();
  });
});

describe("working sets", () => {
  it("drops sets under 60% of the session's top weight and explicit warm-ups", () => {
    const sets = sessionSets(
      "2026-11-24",
      "Squat (Barbell)",
      [
        [40, 10],
        [60, 5],
        [100, 5],
        [100, 5],
        [80, 8],
      ],
      {
        setType: (i) => (i === 1 ? "warmup" : "normal"),
      },
    );
    expect(workingSets(sets).map((s) => s.weightKg)).toEqual([100, 100, 80]);
  });
});

describe("prescription", () => {
  const squat: [string, number, number, number] = ["Squat (Barbell)", 3, 5, 8];

  it("no history → find a working weight", () => {
    const p = rx([], squat);
    expect(p.action).toBe("find-weight");
    expect(p.note).toMatch(/2–3 reps short of failure/);
    expect(p.target).toBe("3 × 5–8");
  });

  it("every working set ≥ repHi → add the barbell step and reset to repLo", () => {
    const p = rx(
      sessionSets("2026-11-24", squat[0], [
        [100, 8],
        [100, 8],
        [100, 9],
      ]),
      squat,
    );
    expect(p).toMatchObject({ action: "increase", weightKg: 102.5, targetReps: 5, sets: 3 });
  });

  it("dumbbell exercises use the dumbbell step", () => {
    const item: [string, number, number, number] = ["Shoulder Press (Dumbbell)", 2, 8, 12];
    const p = rx(
      sessionSets("2026-11-24", item[0], [
        [24, 12],
        [24, 12],
      ]),
      item,
    );
    expect(p).toMatchObject({ action: "increase", weightKg: 26 });
  });

  it("otherwise same weight, target = min(repHi, best + 1)", () => {
    expect(
      rx(
        sessionSets("2026-11-24", squat[0], [
          [100, 6],
          [100, 5],
          [100, 5],
        ]),
        squat,
      ),
    ).toMatchObject({ action: "repeat", weightKg: 100, targetReps: 7 });
    expect(
      rx(
        sessionSets("2026-11-24", squat[0], [
          [100, 8],
          [100, 7],
          [100, 8],
        ]),
        squat,
      ),
    ).toMatchObject({ action: "repeat", targetReps: 8 });
  });

  it("a lighter back-off working set below repHi blocks the increase (all working sets count)", () => {
    const p = rx(
      sessionSets("2026-11-24", squat[0], [
        [100, 8],
        [100, 8],
        [80, 7],
      ]),
      squat,
    );
    expect(p).toMatchObject({ action: "repeat", weightKg: 100, targetReps: 8 });
  });

  it("warm-ups under 60% do not block the increase", () => {
    const p = rx(
      sessionSets("2026-11-24", squat[0], [
        [50, 5],
        [100, 8],
        [100, 8],
        [100, 8],
      ]),
      squat,
    );
    expect(p).toMatchObject({ action: "increase", weightKg: 102.5 });
  });

  it("uses the last session containing the exercise", () => {
    const sets = [
      ...sessionSets("2026-11-17", squat[0], [
        [100, 8],
        [100, 8],
        [100, 8],
      ]),
      ...sessionSets("2026-11-24", squat[0], [
        [102.5, 6],
        [102.5, 5],
        [102.5, 5],
      ]),
    ];
    expect(rx(sets, squat)).toMatchObject({ action: "repeat", weightKg: 102.5, targetReps: 7 });
  });

  it("future-dated sets never count", () => {
    const sets = [
      ...sessionSets("2026-11-24", squat[0], [
        [100, 6],
        [100, 6],
        [100, 6],
      ]),
      ...sessionSets("2026-11-30", squat[0], [
        [200, 8],
        [200, 8],
        [200, 8],
      ]),
    ];
    expect(rx(sets, squat)).toMatchObject({ weightKg: 100, targetReps: 7 });
  });

  it("easy mode: one set fewer, same weight, no increase", () => {
    expect(
      rx(
        sessionSets("2026-11-24", squat[0], [
          [100, 8],
          [100, 8],
          [100, 8],
        ]),
        squat,
        { easy: true },
      ),
    ).toMatchObject({ action: "easy", sets: 2, weightKg: 100, targetReps: 8 });
    expect(
      rx(
        sessionSets("2026-11-24", squat[0], [
          [100, 6],
          [100, 5],
        ]),
        squat,
        { easy: true },
      ),
    ).toMatchObject({ sets: 2, targetReps: 6 });
  });

  it("bodyweight: progress by reps, then suggest adding load", () => {
    const item: [string, number, number, number] = ["Hanging Leg Raise", 3, 15, 20];
    expect(
      rx(
        sessionSets("2026-11-24", item[0], [
          [null, 16],
          [null, 15],
          [null, 14],
        ]),
        item,
        { bodyweight: true },
      ),
    ).toMatchObject({ action: "reps", targetReps: 17, weightKg: null });
    expect(
      rx(
        sessionSets("2026-11-24", item[0], [
          [null, 20],
          [null, 20],
          [null, 21],
        ]),
        item,
        { bodyweight: true },
      ),
    ).toMatchObject({ action: "add-load", targetReps: 15 });
    expect(
      rx(sessionSets("2026-11-24", item[0], [[null, 16]]), item, { bodyweight: true, easy: true }),
    ).toMatchObject({ action: "easy", sets: 2, targetReps: 16 });
  });

  it("explains itself with evidence", () => {
    const p = rx(
      sessionSets("2026-11-24", squat[0], [
        [100, 8],
        [100, 8],
        [100, 8],
      ]),
      squat,
    );
    expect(p.evidence.join(" ")).toMatch(/100×8, 100×8, 100×8/);
  });
});

describe("goal progress", () => {
  it("e1RM-based for ≤12-rep goals", () => {
    const by = sessionsByExercise(sessionSets("2026-11-24", "Squat (Barbell)", [[100, 5]]), TZ, now);
    const g = goalProgress(
      { exercise: "Squat (Barbell)", weightKg: 120, reps: 5 },
      by.get("Squat (Barbell)"),
    );
    expect(g.method).toBe("e1rm");
    expect(g.pct).toBe(83); // 116.7 / 140
  });

  it("load × reps for high-rep goals", () => {
    const by = sessionSets("2026-11-24", "Tibialis Raise", [
      [10, 25],
      [10, 20],
    ]);
    const g = goalProgress(
      { exercise: "Tibialis Raise", weightKg: 20, reps: 25 },
      sessionsByExercise(by, TZ, now).get("Tibialis Raise"),
    );
    expect(g).toMatchObject({ method: "reps", pct: 50 });
  });

  it("zero when there's no history", () => {
    expect(goalProgress({ exercise: "Squat (Barbell)", weightKg: 120, reps: 5 }, undefined).pct).toBe(0);
  });
});
