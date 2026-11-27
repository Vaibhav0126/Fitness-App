import { describe, expect, it } from "vitest";
import { analyzeRun, collectRuns, planProgress } from "@/lib/engine/runs";
import { config, feedback, runWorkout, TZ, tokyo } from "../../helpers/engine";

const cfg = config();
const now = tokyo("2026-12-31", "20:00");
const today = "2026-12-31";

const runsOn = (dates: string[]) =>
  collectRuns(
    dates.map((d) => runWorkout(d, { id: `r-${d}` })),
    TZ,
    now,
  );

describe("run plan progression", () => {
  it("advances one week every runsPerWeek runs", () => {
    const p = planProgress(
      runsOn(["2026-11-18", "2026-11-21", "2026-11-25", "2026-11-28", "2026-12-02"]),
      [],
      cfg,
      today,
    );
    expect(p).toMatchObject({ week: 3, count: 1, complete: false });
    expect(p.log.map((r) => [r.planWeek, r.runInWeek])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [3, 1],
    ]);
  });

  it("repeats the week when shin pain > shinMax, and says why", () => {
    const runs = runsOn(["2026-11-18", "2026-11-21", "2026-11-25"]);
    const p = planProgress(runs, [feedback("2026-11-21", 5)], cfg, today);
    expect(p).toMatchObject({ week: 1, count: 1 });
    expect(p.repeats).toEqual([{ week: 1, date: "2026-11-21", shinPain: 5 }]);
  });

  it("shin pain equal to shinMax does not repeat", () => {
    const p = planProgress(runsOn(["2026-11-18", "2026-11-21"]), [feedback("2026-11-18", 3)], cfg, today);
    expect(p.week).toBe(2);
  });

  it("flags a pending repeat mid-week", () => {
    const p = planProgress(runsOn(["2026-11-18"]), [feedback("2026-11-18", 6)], cfg, today);
    expect(p.repeatPending).toBe(true);
  });

  it("matches feedback by workout id before date", () => {
    const runs = collectRuns(
      [
        runWorkout("2026-11-18", { id: "a", time: "06:00" }),
        runWorkout("2026-11-18", { id: "b", time: "18:00" }),
      ],
      TZ,
      now,
    );
    const p = planProgress(runs, [feedback("2026-11-18", 7, "b")], cfg, today);
    expect(p.log[0]?.feedback).toBeNull();
    expect(p.log[1]?.feedback?.shinPain).toBe(7);
    expect(p.week).toBe(1);
  });

  it("never advances past the plan length", () => {
    const dates = Array.from({ length: 20 }, (_, i) => `2026-11-${String(18 + i).padStart(2, "0")}`).filter(
      (d) => d <= "2026-11-30",
    );
    const more = Array.from({ length: 10 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
    const p = planProgress(runsOn([...dates, ...more]), [], cfg, today);
    expect(p.week).toBe(8);
    expect(p.complete).toBe(true);
  });

  it("ignores runs before planStart and after today (future-dated)", () => {
    const runs = collectRuns(
      [
        runWorkout("2026-11-10"),
        runWorkout("2026-11-18"),
        runWorkout("2026-11-19"),
        runWorkout("2027-01-05"),
      ],
      TZ,
      tokyo("2027-02-01"),
    );
    const p = planProgress(runs, [], cfg, "2026-12-31");
    expect(p.log).toHaveLength(2);
    // collectRuns drops runs after `now`
    expect(
      collectRuns([runWorkout("2026-12-01", { time: "18:00" })], TZ, tokyo("2026-12-01", "07:00")),
    ).toHaveLength(0);
  });
});

describe("run dedupe", () => {
  it("merges two recordings that start within 20 minutes, keeping the one with intervals", () => {
    const a = runWorkout("2026-11-18", {
      id: "watch",
      time: "06:00",
      intervals: [{ kind: "run", avgSpeedKmh: 8 }],
    });
    const b = { ...runWorkout("2026-11-18", { id: "phone", time: "06:05" }), avgCadence: 170 };
    const runs = collectRuns([a, b], TZ, now);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: "watch", avgCadence: 170 });
  });
});

describe("run analysis", () => {
  const analyze = (intervals: NonNullable<Parameters<typeof runWorkout>[1]>["intervals"]) => {
    const p = planProgress(
      collectRuns([runWorkout("2026-11-18", { id: "x", intervals })], TZ, now),
      [],
      cfg,
      today,
    );
    return analyzeRun(p.log[0]!, cfg);
  };

  it("produces 2–4 insights with speed inside the band and HR above the cap", () => {
    const ins = analyze([
      { kind: "warmup", avgSpeedKmh: 5 },
      { kind: "run", avgSpeedKmh: 8.0, maxHr: 145, cadence: 168 },
      { kind: "walk", avgSpeedKmh: 5 },
      { kind: "run", avgSpeedKmh: 8.2, maxHr: 158, cadence: 170 },
      { kind: "cooldown", avgSpeedKmh: 4.5 },
    ]);
    expect(ins.length).toBeGreaterThanOrEqual(2);
    expect(ins.length).toBeLessThanOrEqual(4);
    expect(ins.find((i) => i.id.endsWith("speed"))?.text).toMatch(/8\.1 km\/h, inside your 7\.5–8\.5 target/);
    const hr = ins.find((i) => i.id.endsWith("hr"));
    expect(hr?.severity).toBe("warn");
    expect(hr?.text).toMatch(/peaked at 158, above your 150 cap/);
  });

  it("warns at HR just over the cap (no tolerance)", () => {
    const hr = analyze([{ kind: "run", avgSpeedKmh: 8, maxHr: 151 }]).find((i) => i.id.endsWith("hr"));
    expect(hr?.severity).toBe("warn");
    const ok = analyze([{ kind: "run", avgSpeedKmh: 8, maxHr: 150 }]).find((i) => i.id.endsWith("hr"));
    expect(ok?.severity).toBe("good");
  });

  it("flags uneven pacing and too-fast running", () => {
    const ins = analyze([
      { kind: "run", avgSpeedKmh: 8.4 },
      { kind: "run", avgSpeedKmh: 9.4 },
    ]);
    expect(ins.find((i) => i.id.endsWith("speed"))?.severity).toBe("warn");
    expect(ins.some((i) => i.id.endsWith("pacing"))).toBe(true);
  });

  it("reports cadence against the band", () => {
    const ins = analyze([{ kind: "run", avgSpeedKmh: 8, maxHr: 140, cadence: 158 }]);
    expect(ins.find((i) => i.id.endsWith("cadence"))?.text).toMatch(/158 steps\/min/);
  });
});
