/**
 * Wall-clock time in an IANA zone → UTC instant, without a date library.
 * Works by measuring the zone's offset at the guessed instant and correcting once
 * (twice around DST transitions). Non-existent local times (spring-forward gap)
 * resolve to the instant after the gap; ambiguous ones (fall-back) to the first.
 */

const dtf = new Map<string, Intl.DateTimeFormat>();

function offsetMinutes(instantMs: number, timeZone: string): number {
  let f = dtf.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtf.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export function zonedToUtc(t: WallTime, timeZone: string): Date {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour ?? 0, t.minute ?? 0, t.second ?? 0);
  let guess = wall - offsetMinutes(wall, timeZone) * 60000;
  const o2 = offsetMinutes(guess, timeZone);
  const corrected = wall - o2 * 60000;
  if (corrected !== guess) {
    const o3 = offsetMinutes(corrected, timeZone);
    guess = o3 === o2 ? corrected : Math.max(guess, corrected);
  }
  return new Date(guess);
}
