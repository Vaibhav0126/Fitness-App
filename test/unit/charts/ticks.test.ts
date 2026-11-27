import { describe, expect, it } from "vitest";
import { labelIndices, niceScale, stepDecimals } from "@/lib/charts/ticks";

describe("niceScale", () => {
  it("rounds to 1/2/2.5/5 steps covering the data", () => {
    expect(niceScale(37.2, 58.9)).toEqual({ min: 35, max: 60, step: 5, ticks: [35, 40, 45, 50, 55, 60] });
    expect(niceScale(0, 9400, 5, { zero: true }).ticks).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceScale(5.4, 7.9).ticks).toEqual([5, 5.5, 6, 6.5, 7, 7.5, 8]);
  });

  it("has no float noise", () => {
    const s = niceScale(0.1, 0.7);
    expect(s.ticks.every((t) => String(t).length <= 4)).toBe(true);
  });

  it("handles flat and invalid input", () => {
    expect(niceScale(60, 60).ticks.length).toBeGreaterThanOrEqual(2);
    expect(niceScale(0, 0).ticks).toContain(0);
    expect(niceScale(NaN, 1)).toEqual({ min: 0, max: 1, step: 1, ticks: [0, 1] });
  });

  it("can include zero", () => {
    expect(niceScale(120, 145, 5, { zero: true }).min).toBe(0);
  });
});

describe("helpers", () => {
  it("stepDecimals", () => {
    expect(stepDecimals(2.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(500)).toBe(0);
  });
  it("labelIndices includes ends", () => {
    expect(labelIndices(3)).toEqual([0, 1, 2]);
    const l = labelIndices(90, 6);
    expect(l[0]).toBe(0);
    expect(l.at(-1)).toBe(89);
    expect(l.length).toBe(6);
  });
});
