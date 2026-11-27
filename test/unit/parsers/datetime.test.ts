import { describe, expect, it } from "vitest";
import { parseDateTime } from "@/lib/parsers/datetime";
import { zonedToUtc } from "@/lib/parsers/tz";

const iso = (raw: string, tz = "Asia/Tokyo") => parseDateTime(raw, tz).instant.toISOString();

describe("parseDateTime", () => {
  it("HAE 12-hour clock with U+202F narrow no-break space and offset", () => {
    expect(iso("2026-11-21 6:05:47 AM +0900")).toBe("2026-11-20T21:05:47.000Z");
    expect(iso("2026-11-21 6:05:47 PM +0900")).toBe("2026-11-21T09:05:47.000Z");
    expect(parseDateTime("2026-11-21 6:05:47 AM +0900", "UTC").localDate).toBe("2026-11-21");
  });

  it("12 AM and 12 PM", () => {
    expect(iso("2026-11-21 12:00:00 AM +0900")).toBe("2026-11-20T15:00:00.000Z");
    expect(iso("2026-11-21 12:30:00 PM +0900")).toBe("2026-11-21T03:30:00.000Z");
  });

  it("other unicode spaces (NBSP) and plain 24-hour HAE dates", () => {
    expect(iso("2026-11-21 06:05:47 +0900")).toBe("2026-11-20T21:05:47.000Z");
    expect(iso("2026-11-21 18:05:47 -0500")).toBe("2026-11-21T23:05:47.000Z");
  });

  it("Hevy local times use the user's zone", () => {
    expect(iso("17 Nov 2026, 06:05")).toBe("2026-11-16T21:05:00.000Z");
    expect(iso("17 Nov 2026, 06:05", "Europe/London")).toBe("2026-11-17T06:05:00.000Z");
  });

  it("Strong / ISO local and offset forms", () => {
    expect(iso("2026-11-20 07:00:00")).toBe("2026-11-19T22:00:00.000Z");
    expect(iso("2026-11-20T07:00:00Z")).toBe("2026-11-20T07:00:00.000Z");
    expect(iso("2026-11-20T07:00:00.123+01:00")).toBe("2026-11-20T06:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(() => parseDateTime("yesterday", "UTC")).toThrow(/unrecognised/);
    expect(() => parseDateTime("", "UTC")).toThrow();
  });
});

describe("zonedToUtc across DST", () => {
  it("handles New York fall-back and spring-forward", () => {
    expect(zonedToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, "America/New_York").toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedToUtc({ year: 2026, month: 12, day: 1, hour: 9 }, "America/New_York").toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
    // 2026-03-08 02:30 does not exist in New York → resolves after the gap
    expect(
      zonedToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
  });
});
