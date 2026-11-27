import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyIntervals, parseHaeFile, workoutType } from "@/lib/parsers/hae";

const fixture = (f: string) =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../fixtures", f), "utf8")) as unknown;
const opts = { timeZone: "Asia/Tokyo", runClassification: { walkSpeedKmh: 5.5, marginKmh: 1 } };

describe("HAE metrics", () => {
  const res = parseHaeFile(fixture("hae-metrics.json"), opts);
  const get = (name: string, date: string) =>
    res.metrics.find((m) => m.name === name && m.date === date)?.value;

  it("maps metric names, sums steps per day and converts units", () => {
    expect(get("hrv_sdnn_ms", "2026-11-23")).toBe(49.9);
    expect(get("resting_hr", "2026-11-22")).toBe(57);
    expect(get("steps", "2026-11-23")).toBe(10432);
    expect(get("weight_kg", "2026-11-23")).toBe(80.1);
    expect(get("active_energy_kcal", "2026-11-23")).toBe(640.06);
    expect(get("vo2max", "2026-11-23")).toBe(44.1);
    expect(get("walking_hr_avg", "2026-11-23")).toBe(101);
  });

  it("sleep: totalSleep, else asleep, else core+deep+rem; attributed to the wake-up date", () => {
    expect(get("sleep_hours", "2026-11-23")).toBe(7.2);
    expect(get("sleep_hours", "2026-11-22")).toBe(6);
  });

  it("reports unknown metric names instead of failing", () => {
    expect(res.unknownMetrics).toEqual(["blood_oxygen_saturation"]);
  });
});

describe("HAE workouts", () => {
  const res = parseHaeFile(fixture("hae-workouts.json"), opts);
  const run = res.workouts.find((w) => w.type === "run")!;

  it("parses the run summary with U+202F dates", () => {
    expect(run).toMatchObject({
      externalId: "6C1B2A90-RUNWALK-0001",
      start: "2026-11-20T21:05:47.000Z",
      durationS: 1770,
      avgHr: 134,
      maxHr: 152,
      energyKcal: 310,
    });
    expect(run.distanceM).toBe(3105);
  });

  it("classifies run-walk intervals by speed (m/s × 3.6)", () => {
    expect(run.intervals?.map((i) => i.kind)).toEqual([
      "warmup",
      ...Array.from({ length: 5 }, () => ["run", "walk"]).flat(),
      "run",
      "cooldown",
    ]);
    const firstRun = run.intervals?.find((i) => i.kind === "run");
    expect(firstRun).toMatchObject({
      avgSpeedKmh: 8.1,
      durationS: 120,
      avgHr: 145,
      maxHr: 151,
      cadence: 168,
    });
  });

  it("converts kJ and maps strength workouts", () => {
    expect(res.workouts.find((w) => w.type === "strength")).toMatchObject({ energyKcal: 263, intervals: [] });
  });

  it("a later export without stepCount yields nulls (the importer keeps earlier values)", () => {
    const later = parseHaeFile(fixture("hae-workouts-later.json"), opts).workouts[0]!;
    expect(later.avgCadence).toBeNull();
    expect(later.avgHr).toBeNull();
    expect(later.intervals?.every((i) => i.cadence == null)).toBe(true);
  });

  it("rejects non-HAE JSON", () => {
    expect(() => parseHaeFile({ foo: 1 }, opts)).toThrow(/Health Auto Export/);
  });
});

describe("helpers", () => {
  it("workoutType", () => {
    expect(workoutType("Outdoor Run")).toBe("run");
    expect(workoutType("Indoor Walk")).toBe("walk");
    expect(workoutType("Outdoor Cycling")).toBe("ride");
    expect(workoutType("Traditional Strength Training")).toBe("strength");
    expect(workoutType("Yoga")).toBe("other");
  });

  it("classifyIntervals: all-walk session and leading slow intervals", () => {
    const c = { walkSpeedKmh: 5.5, marginKmh: 1 };
    expect(classifyIntervals([5, 5.2, 8, 5, 8, 4.5], c)).toEqual([
      "warmup",
      "warmup",
      "run",
      "walk",
      "run",
      "cooldown",
    ]);
    expect(classifyIntervals([5, 5, 5], c)).toEqual(["warmup", "walk", "cooldown"]);
  });
});
