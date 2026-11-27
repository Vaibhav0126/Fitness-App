import { describe, expect, it } from "vitest";
import { addDays, fmtDay, fmtMmSs, isoWeekStart, localParts, weekday } from "@/lib/engine/dates";

describe("dates", () => {
  it("converts instants to local calendar dates via IANA zones", () => {
    const i = new Date("2026-11-26T20:30:00Z");
    expect(localParts(i, "Asia/Tokyo")).toEqual({ date: "2026-11-27", hour: 5, minute: 30 });
    expect(localParts(i, "America/New_York")).toEqual({ date: "2026-11-26", hour: 15, minute: 30 });
  });

  it("handles DST transitions without fixed offsets", () => {
    // US DST ended 2026-11-01 at 02:00 local (06:00Z): 05:30Z is still EDT (UTC−4).
    expect(localParts(new Date("2026-11-01T05:30:00Z"), "America/New_York").hour).toBe(1);
    expect(localParts(new Date("2026-11-01T06:30:00Z"), "America/New_York").hour).toBe(1);
    expect(localParts(new Date("2026-11-01T07:30:00Z"), "America/New_York").hour).toBe(2);
  });

  it("reports midnight as hour 0", () => {
    expect(localParts(new Date("2026-11-26T15:00:00Z"), "Asia/Tokyo").hour).toBe(0);
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekday("2026-11-27")).toBe(5);
    expect(isoWeekStart("2026-11-29")).toBe("2026-11-23");
    expect(isoWeekStart("2026-11-23")).toBe("2026-11-23");
    expect(fmtDay("2026-11-27")).toBe("Fri 27 Nov");
    expect(fmtMmSs(90)).toBe("1:30");
    expect(fmtMmSs(600)).toBe("10:00");
  });
});
