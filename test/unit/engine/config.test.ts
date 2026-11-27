import { describe, expect, it } from "vitest";
import { defaultPlanConfig, emptyPlanConfig, planConfigSchema } from "@/lib/engine/config";

describe("PlanConfig", () => {
  const opts = { timeZone: "Asia/Tokyo", planStart: "2026-11-18" };

  it("default template matches spec §10", () => {
    const cfg = defaultPlanConfig(opts);
    expect(Object.keys(cfg.routines)).toEqual(["Lower A", "Upper A", "Lower B", "Upper B"]);
    expect(cfg.routines["Lower A"]?.[0]).toEqual(["Squat (Barbell)", 3, 5, 8]);
    expect(cfg.runPlan.map((w) => [w.reps, w.runS, w.walkS])).toEqual([
      [8, 60, 120],
      [8, 90, 120],
      [6, 120, 90],
      [6, 120, 120],
      [5, 180, 90],
      [4, 240, 60],
      [3, 420, 60],
      [2, 600, 60],
    ]);
    expect(cfg.runTargets).toEqual({
      speedKmhMin: 7.5,
      speedKmhMax: 8.5,
      hrCap: 150,
      cadenceMin: 165,
      cadenceMax: 175,
    });
  });

  it("start-from-scratch config is valid", () => {
    expect(() => emptyPlanConfig(opts)).not.toThrow();
  });

  it("rejects unknown time zones, unknown routines and bad rep ranges", () => {
    const cfg = defaultPlanConfig(opts);
    expect(planConfigSchema.safeParse({ ...cfg, timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(
      planConfigSchema.safeParse({
        ...cfg,
        schedule: { ...cfg.schedule, "1": { kind: "strength", routine: "Nope" } },
      }).success,
    ).toBe(false);
    expect(
      planConfigSchema.safeParse({ ...cfg, schedule: { ...cfg.schedule, "1": { kind: "strength" } } })
        .success,
    ).toBe(false);
    expect(
      planConfigSchema.safeParse({ ...cfg, routines: { ...cfg.routines, X: [["Squat", 3, 9, 5]] } }).success,
    ).toBe(false);
  });
});
