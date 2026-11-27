import { describe, expect, it } from "vitest";
import { resolveMetrics } from "@/lib/engine/metrics";
import { computeReadiness } from "@/lib/engine/readiness";
import { metricSeries } from "../../helpers/engine";

const today = "2026-11-27";
const r = (rows: Parameters<typeof resolveMetrics>[0]) => computeReadiness(resolveMetrics(rows), today);

const healthy = [
  ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 50, 50, 50, 50, 50]),
  ...metricSeries("resting_hr", today, [55, 55, 55, 55, 55, 55, 55, 55]),
  ...metricSeries("sleep_hours", today, [7, 7, 7, 7, 7, 7, 7, 7]),
];

describe("readiness", () => {
  it("good with all signals normal", () => {
    expect(r(healthy).level).toBe("good");
  });

  it("ok with one flag; low with two", () => {
    const shortSleep = healthy.map((m) =>
      m.name === "sleep_hours" && m.date === today ? { ...m, value: 5.5 } : m,
    );
    expect(r(shortSleep).level).toBe("ok");
    expect(r(shortSleep).flags).toEqual(["sleep"]);
    const plusHrv = shortSleep.map((m) =>
      m.name === "hrv_sdnn_ms" && m.date === today ? { ...m, value: 42 } : m,
    );
    expect(r(plusHrv).level).toBe("low");
  });

  it("HRV flag at exactly −15%, not at −14%", () => {
    const at = (v: number) =>
      healthy.map((m) => (m.name === "hrv_sdnn_ms" && m.date === today ? { ...m, value: v } : m));
    expect(r(at(42.5)).flags).toContain("hrv"); // −15%
    expect(r(at(43.0)).flags).not.toContain("hrv"); // −14%
  });

  it("resting HR flag at +5 bpm", () => {
    const at = (v: number) =>
      healthy.map((m) => (m.name === "resting_hr" && m.date === today ? { ...m, value: v } : m));
    expect(r(at(60)).flags).toContain("rhr");
    expect(r(at(59)).flags).not.toContain("rhr");
  });

  it("baseline uses only the previous 7 entries", () => {
    // 10 days: three very high old values must be ignored.
    const rows = [
      ...metricSeries("hrv_sdnn_ms", today, [200, 200, 200, 50, 50, 50, 50, 50, 50, 50, 42]),
      ...metricSeries("resting_hr", today, [55, 55, 55, 55]),
      ...metricSeries("sleep_hours", today, [7]),
    ];
    const res = r(rows);
    expect(res.signals.hrv.baseline).toBe(50);
    expect(res.signals.hrv.delta).toBe(-16);
  });

  it("missing data is unknown, never low", () => {
    expect(r([]).level).toBe("unknown");
    // only sleep (short) → one flag but other signals missing → unknown
    expect(r(metricSeries("sleep_hours", today, [5])).level).toBe("unknown");
    // HRV without baseline (2 earlier nights) → not evaluable
    const thin = [
      ...metricSeries("hrv_sdnn_ms", today, [50, 50, 40]),
      ...metricSeries("resting_hr", today, [55, 55, 55, 55]),
      ...metricSeries("sleep_hours", today, [7]),
    ];
    expect(r(thin).level).toBe("unknown");
  });

  it("two real flags are low even when the third signal is missing", () => {
    const rows = [
      ...metricSeries("hrv_sdnn_ms", today, [50, 50, 50, 40]),
      ...metricSeries("sleep_hours", today, [5]),
    ];
    expect(r(rows).level).toBe("low");
  });

  it("stale data (older than yesterday) counts as missing", () => {
    const old = healthy.map((m) => ({ ...m, date: m.date.replace("2026-11-2", "2026-11-1") }));
    expect(r(old).level).toBe("unknown");
  });

  it("ignores future-dated rows", () => {
    const future = [
      ...healthy,
      { name: "sleep_hours" as const, date: "2026-11-28", value: 3, source: "shortcut" },
    ];
    expect(r(future).level).toBe("good");
  });

  it("picks one value per day by source priority", () => {
    const rows = [
      ...healthy,
      { name: "sleep_hours" as const, date: today, value: 4, source: "apple_health" },
    ];
    expect(r(rows).signals.sleep.current?.v).toBe(7); // shortcut beats apple_health
  });
});
