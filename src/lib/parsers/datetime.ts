import { type WallTime, zonedToUtc } from "./tz";

/*
 * Date-time parsing for imported files. Handles:
 *   - ISO 8601 with Z/offset             "2026-11-21T06:05:47+09:00"
 *   - "YYYY-MM-DD HH:mm[:ss]" local       "2026-11-11 06:05:00" (Strong)
 *   - 12-hour clocks with any space kind  "2026-11-21 6:05:47 AM +0900" (HAE, U+202F before AM)
 *   - Hevy                                "11 Nov 2026, 06:05"
 * Local (offset-less) times are interpreted in the given IANA zone.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Replace every Unicode space (U+00A0, U+2000–U+200B, U+202F, U+205F, U+3000) with a plain space. */
export const normalizeSpaces = (s: string) =>
  s
    .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function to24h(hour: number, ampm: string | undefined): number {
  if (!ampm) return hour;
  const pm = ampm.toLowerCase() === "pm";
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

function offsetToMinutes(off: string): number {
  if (off === "Z" || off === "z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(off);
  if (!m) throw new Error(`bad UTC offset "${off}"`);
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

export interface ParsedDateTime {
  instant: Date;
  /** Wall-clock calendar date as written in the source (YYYY-MM-DD). */
  localDate: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function build(t: WallTime, offset: string | undefined, timeZone: string): ParsedDateTime {
  const localDate = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  if (offset) {
    const ms =
      Date.UTC(t.year, t.month - 1, t.day, t.hour ?? 0, t.minute ?? 0, t.second ?? 0) -
      offsetToMinutes(offset) * 60000;
    return { instant: new Date(ms), localDate };
  }
  return { instant: zonedToUtc(t, timeZone), localDate };
}

export function parseDateTime(raw: string, timeZone: string): ParsedDateTime {
  const s = normalizeSpaces(raw);
  if (!s) throw new Error("empty date");

  // YYYY-MM-DD[T ]H:mm[:ss][.sss][ AM|PM][ offset]
  let m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?: ?([AaPp][Mm]))?)? ?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      s,
    );
  if (m) {
    const hour = m[4] != null ? to24h(Number(m[4]), m[7]) : 0;
    return build(
      { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour, minute: m[5] ? +m[5] : 0, second: m[6] ? +m[6] : 0 },
      m[8],
      timeZone,
    );
  }

  // Hevy: "11 Nov 2026, 06:05" (also "11 Nov 2026 06:05", optional AM/PM)
  m = /^(\d{1,2}) ([A-Za-z]{3,4})\.? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp][Mm]))?$/.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (!month) throw new Error(`unknown month in "${raw}"`);
    return build(
      {
        year: +m[3]!,
        month,
        day: +m[1]!,
        hour: to24h(Number(m[4]), m[7]),
        minute: +m[5]!,
        second: m[6] ? +m[6] : 0,
      },
      undefined,
      timeZone,
    );
  }

  throw new Error(`unrecognised date "${raw}"`);
}
