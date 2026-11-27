import { describe, expect, it } from "vitest";
import {
  looseNumber,
  normalizeDate,
  SHORTCUT_MAX_DAYS,
  shortcutPayloadSchema,
  shortcutToMetrics,
  sleepToHours,
} from "@/lib/importers/shortcut";

const parse = (body: unknown) => shortcutPayloadSchema.parse(body);

describe("Shortcut payload v1", () => {
  it("maps the spec example to metric records", () => {
    const p = parse({
      v: 1,
      tz: "Asia/Tokyo",
      days: [
        {
          date: "2026-11-26",
          sleepHours: 7.2,
          hrvSdnnMs: 48,
          restingHr: 56,
          steps: 10432,
          activeEnergyKcal: 640,
          vo2max: 44.1,
          weightKg: 80.1,
        },
      ],
    });
    const { metrics, skipped } = shortcutToMetrics(p, "2026-11-26");
    expect(skipped).toEqual([]);
    expect(Object.fromEntries(metrics.map((m) => [m.name, m.value]))).toEqual({
      sleep_hours: 7.2,
      hrv_sdnn_ms: 48,
      resting_hr: 56,
      steps: 10432,
      active_energy_kcal: 640,
      vo2max: 44.1,
      weight_kg: 80.1,
    });
    expect(metrics.every((m) => m.date === "2026-11-26" && m.kind === "metric")).toBe(true);
  });

  it("accepts the loose types Shortcuts sends and skips empty values", () => {
    const p = parse({
      v: "1",
      days: [
        {
          date: "2026-11-26",
          sleepHours: "7,5",
          hrvSdnnMs: "48.6 ms",
          steps: "10,432",
          restingHr: "",
          vo2max: null,
        },
      ],
    });
    const { metrics } = shortcutToMetrics(p, "2026-11-26");
    expect(Object.fromEntries(metrics.map((m) => [m.name, m.value]))).toEqual({
      sleep_hours: 7.5,
      hrv_sdnn_ms: 48.6,
      steps: 10432,
    });
  });

  it("treats zeros as missing samples (locked phone), except steps and energy", () => {
    const p = parse({ v: 1, days: [{ date: "2026-11-26", sleepHours: 0, hrvSdnnMs: 0, steps: 0 }] });
    expect(shortcutToMetrics(p, "2026-11-26").metrics).toEqual([
      { kind: "metric", date: "2026-11-26", name: "steps", value: 0 },
    ]);
  });

  it("converts sleep sent in minutes or seconds", () => {
    expect(sleepToHours(7.25)).toBe(7.25);
    expect(sleepToHours(435)).toBe(7.25);
    expect(sleepToHours(26_100)).toBe(7.25);
  });

  it("reports out-of-range values, bad dates and dates outside the window", () => {
    const p = parse({
      v: 1,
      days: [
        { date: "2026-11-26", restingHr: 400, hrvSdnnMs: "abc" },
        { date: "26/11/2026", steps: 1 },
        { date: "2026-01-01", steps: 1 },
        { date: "2026-11-28", steps: 1 },
      ],
    });
    const { metrics, skipped } = shortcutToMetrics(p, "2026-11-26");
    expect(metrics).toEqual([]);
    expect(skipped.map((s) => s.field)).toEqual(["hrvSdnnMs", "restingHr", "date", "date", "date"]);
  });

  it(`rejects more than ${SHORTCUT_MAX_DAYS} days and unknown versions`, () => {
    const days = Array.from({ length: SHORTCUT_MAX_DAYS + 1 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
    }));
    expect(shortcutPayloadSchema.safeParse({ v: 1, days }).success).toBe(false);
    expect(shortcutPayloadSchema.safeParse({ v: 2, days: [{ date: "2026-11-26" }] }).success).toBe(false);
    expect(shortcutPayloadSchema.safeParse({ v: 1, days: [] }).success).toBe(false);
  });

  it("parses loose numbers and dates", () => {
    expect(looseNumber(" 10 432 ")).toBe(10432);
    expect(looseNumber("1,234,567")).toBe(1234567);
    expect(looseNumber("80.1kg")).toBe(80.1);
    expect(looseNumber("n/a")).toBeNull();
    expect(looseNumber(Number.NaN)).toBeNull();
    expect(normalizeDate("2026-11-26T07:00:00+09:00")).toBe("2026-11-26");
    expect(normalizeDate("2026/1/5")).toBe("2026-01-05");
    expect(normalizeDate("2026-02-30")).toBeNull();
  });
});
