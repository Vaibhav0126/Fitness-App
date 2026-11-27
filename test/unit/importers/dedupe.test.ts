import { describe, expect, it } from "vitest";
import { duplicateStrengthSessions, sessionKey } from "@/lib/importers/dedupe";

const at = (iso: string) => new Date(iso);

describe("cross-source strength session dedupe", () => {
  it("keeps the Hevy API session over the same session from a Hevy CSV", () => {
    const sets = [
      { source: "csv_hevy", performedAt: at("2026-11-23T21:05:00Z") },
      { source: "csv_hevy", performedAt: at("2026-11-23T21:05:00Z") },
      { source: "hevy", performedAt: at("2026-11-23T21:05:37Z") },
      { source: "csv_hevy", performedAt: at("2026-11-25T21:00:00Z") },
    ];
    expect(duplicateStrengthSessions(sets)).toEqual(
      new Set([sessionKey("csv_hevy", at("2026-11-23T21:05:00Z"))]),
    );
  });

  it("never merges sessions from the same source or far apart", () => {
    const sets = [
      { source: "hevy", performedAt: at("2026-11-23T21:05:00Z") },
      { source: "hevy", performedAt: at("2026-11-23T21:06:00Z") },
      { source: "csv_strong", performedAt: at("2026-11-23T21:10:00Z") },
    ];
    expect(duplicateStrengthSessions(sets).size).toBe(0);
  });
});
