/**
 * Calendar helpers. Calendar dates are plain `YYYY-MM-DD` strings and are manipulated
 * in UTC so arithmetic never crosses a DST boundary. Instants are converted to the
 * user's local calendar through `Intl` with an IANA time zone (no fixed offsets).
 */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  /** YYYY-MM-DD in the given zone */
  date: string;
  hour: number;
  minute: number;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

export const localDate = (instant: Date | string, timeZone: string): string =>
  localParts(typeof instant === "string" ? new Date(instant) : instant, timeZone).date;

const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** Monday of the ISO week containing `date`. */
export function isoWeekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** "Mon 3 Nov" */
export function fmtDay(date: string): string {
  const d = new Date(toUtc(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** 90 → "1:30" */
export function fmtMmSs(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
