import { describe, expect, it } from "vitest";
import { computeState } from "@/lib/engine";
import { config, emptyStore, sessionSets, tokyo } from "../../helpers/engine";

const exercises = {
  "Squat (Barbell)": { muscleGroup: "quads" },
  "Bench Press (Barbell)": { muscleGroup: "chest" },
};

describe("weekly volume", () => {
  it("counts working sets per muscle group per ISO week", () => {
    const sets = [
      ...sessionSets("2026-11-16", "Squat (Barbell)", [
        [40, 5],
        [100, 5],
        [100, 5],
        [100, 5],
      ]), // warm-up excluded
      ...sessionSets("2026-11-19", "Squat (Barbell)", [
        [100, 5],
        [100, 5],
      ]),
      ...sessionSets("2026-11-23", "Bench Press (Barbell)", [[80, 5]]),
    ];
    const s = computeState(emptyStore({ sets, exercises }), config(), tokyo("2026-11-27"));
    expect(s.weekly.map((w) => [w.week, w.groups])).toEqual([
      ["2026-11-16", { quads: 5 }],
      ["2026-11-23", { chest: 1 }],
    ]);
  });

  it("flags planned groups under 10 or over 22 sets in the last complete week", () => {
    const many = Array.from({ length: 23 }, () => [100, 5] as [number, number]);
    const sets = [
      ...sessionSets("2026-11-16", "Squat (Barbell)", many),
      ...sessionSets("2026-11-17", "Bench Press (Barbell)", [[80, 5]]),
    ];
    const s = computeState(emptyStore({ sets, exercises }), config(), tokyo("2026-11-27"));
    expect(s.volumeInsights.map((i) => i.id)).toEqual(["volume.chest.low", "volume.quads.high"]);
  });

  it("never flags the current partial week", () => {
    const sets = sessionSets("2026-11-23", "Bench Press (Barbell)", [[80, 5]]);
    expect(
      computeState(emptyStore({ sets, exercises }), config(), tokyo("2026-11-27")).volumeInsights,
    ).toEqual([]);
  });
});
