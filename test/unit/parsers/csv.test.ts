import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvToRecords, detectDelimiter, parseCsv } from "@/lib/parsers/csv";
import { detectPreset, normalizeStrengthRows, PRESETS } from "@/lib/parsers/strength-csv";

const fixture = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../../fixtures", f), "utf8");

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded delimiters/newlines, CRLF and BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","he said ""hi""","multi\nline"\r\n1,,3\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "multi\nline"],
      ["1", "", "3"],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a,b\n")).toBe(",");
  });
});

describe("Hevy CSV", () => {
  const { headers, records } = csvToRecords(fixture("hevy.csv"));
  const preset = detectPreset(headers);

  it("detects the Hevy preset", () => {
    expect(preset?.id).toBe("hevy");
  });

  it("normalizes sets, keeps warm-up types, skips cardio rows", () => {
    const { sets, skipped } = normalizeStrengthRows(records, preset!.mapping, "Asia/Tokyo");
    expect(sets).toHaveLength(11);
    expect(skipped).toEqual([{ row: 9, reason: "no reps (cardio or timed set)" }]);
    const first = sets[0]!;
    expect(first).toMatchObject({
      exerciseRaw: "Squat (Barbell)",
      performedAt: "2026-11-16T21:05:00.000Z",
      sessionEnd: "2026-11-16T22:10:00.000Z",
      setIndex: 0,
      setType: "warmup",
      weightKg: 40,
      reps: 10,
      sessionTitle: "Lower A",
    });
    expect(first.externalId).toBe("2026-11-16T21:05:00.000Z|squat (barbell)|0");
    expect(sets.find((s) => s.exerciseRaw === "Hanging Leg Raise")).toMatchObject({
      weightKg: null,
      reps: 16,
    });
    expect(sets.find((s) => s.setIndex === 3 && s.exerciseRaw.startsWith("Squat"))?.rpe).toBe(8.5);
    expect(sets.filter((s) => s.sessionTitle === "Upper A, heavy")).toHaveLength(4);
  });

  it("external ids are stable across parses (idempotent re-import)", () => {
    const a = normalizeStrengthRows(records, preset!.mapping, "Asia/Tokyo").sets.map((s) => s.externalId);
    const b = normalizeStrengthRows(records, preset!.mapping, "Asia/Tokyo").sets.map((s) => s.externalId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("switches to pounds for weight_lbs exports", () => {
    const p = detectPreset([...PRESETS.hevy.signature, "weight_lbs", "reps"]);
    expect(p?.mapping).toMatchObject({ weightUnit: "lb", columns: { weight: "weight_lbs" } });
  });
});

describe("Strong CSV", () => {
  const { headers, records } = csvToRecords(fixture("strong.csv"));

  it("detects the Strong preset and converts pounds", () => {
    const preset = detectPreset(headers);
    expect(preset?.id).toBe("strong");
    const { sets, skipped } = normalizeStrengthRows(
      records,
      { ...preset!.mapping, weightUnit: "lb" },
      "Asia/Tokyo",
    );
    expect(skipped.map((s) => s.reason)).toEqual(["rest timer row"]);
    expect(sets.map((s) => [s.setType, s.weightKg, s.reps, s.setIndex])).toEqual([
      ["warmup", 43.09, 8, 0],
      ["normal", 83.91, 10, 1],
      ["normal", 83.91, 9, 2],
      ["normal", 45.36, 15, 0],
    ]);
    expect(sets[0]?.performedAt).toBe("2026-11-19T22:00:00.000Z");
  });

  it("manual mapping: missing required columns produce skips, not crashes", () => {
    const { sets, skipped } = normalizeStrengthRows(
      records,
      { source: "csv", weightUnit: "kg", columns: { start: "Date", exercise: "Exercise Name" } },
      "UTC",
    );
    expect(sets).toHaveLength(0);
    expect(skipped.length).toBe(5);
  });
});
