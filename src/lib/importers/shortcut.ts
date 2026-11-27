import { z } from "zod";
import { addDays } from "../engine/dates";
import type { MetricRecord } from "./schemas";

/*
 * iOS Shortcut payload, version 1 (spec §4.1; documented in docs/shortcut.md):
 *   { "v": 1, "tz": "Asia/Tokyo", "days": [ { "date": "2026-11-26", "sleepHours": 7.2, ... } ] }
 *
 * Shortcuts is loose about types, so values may arrive as numbers or strings
 * ("7.2", "7,2", "48 ms", ""). Empty values mean "no sample" and are skipped.
 */

export const SHORTCUT_MAX_DAYS = 14;

export const SHORTCUT_FIELDS = {
  sleepHours: { name: "sleep_hours", min: 0, max: 24 },
  hrvSdnnMs: { name: "hrv_sdnn_ms", min: 1, max: 300 },
  restingHr: { name: "resting_hr", min: 20, max: 200 },
  steps: { name: "steps", min: 0, max: 200_000 },
  activeEnergyKcal: { name: "active_energy_kcal", min: 0, max: 20_000 },
  vo2max: { name: "vo2max", min: 10, max: 100 },
  weightKg: { name: "weight_kg", min: 20, max: 400 },
  walkingHrAvg: { name: "walking_hr_avg", min: 30, max: 220 },
} as const satisfies Record<string, { name: MetricRecord["name"]; min: number; max: number }>;

type Field = keyof typeof SHORTCUT_FIELDS;

const loose = z.union([z.number(), z.string(), z.null()]).optional();

const daySchema = z
  .object({
    date: z.string().trim(),
    ...(Object.fromEntries(Object.keys(SHORTCUT_FIELDS).map((k) => [k, loose])) as Record<
      Field,
      typeof loose
    >),
  })
  .passthrough();

export const shortcutPayloadSchema = z.object({
  v: z.union([z.literal(1), z.literal("1")]),
  tz: z.string().max(64).optional(),
  days: z.array(daySchema).min(1).max(SHORTCUT_MAX_DAYS),
});

export type ShortcutPayload = z.infer<typeof shortcutPayloadSchema>;

/** "7.2" / "7,2" / "48 ms" / " 10432 " → number; "" / null / junk → null. */
export function looseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[\s  ]/g, "");
  if (!s) return null;
  // "10,432" (thousands) vs "7,2" (decimal comma): a comma followed by exactly 3 digits and
  // no dot is ambiguous; treat it as thousands only for values that are integers otherwise.
  if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else if (!s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const m = s.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sleep must be hours, but a Shortcut that sums sample durations can send minutes or
 * seconds. Values that can't be hours are converted: ≤ 1440 → minutes, else seconds.
 */
export function sleepToHours(v: number): number {
  if (v <= 24) return v;
  if (v <= 24 * 60) return v / 60;
  return v / 3600;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-26", "2026-11-26T07:00:00+09:00" or "2026/11/26" → "2026-11-26". */
export function normalizeDate(s: string): string | null {
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const d = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  if (!ISO_DATE.test(d)) return null;
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? null : d;
}

export interface ShortcutParseResult {
  metrics: MetricRecord[];
  skipped: Array<{ date: string; field: string; reason: string }>;
}

/**
 * Turns a validated payload into metric records. `today` is the local date in the
 * user's time zone; dates more than a day ahead or older than 60 days are refused.
 */
export function shortcutToMetrics(p: ShortcutPayload, today: string): ShortcutParseResult {
  const out: ShortcutParseResult = { metrics: [], skipped: [] };
  const earliest = addDays(today, -60);
  const latest = addDays(today, 1);
  for (const day of p.days) {
    const date = normalizeDate(day.date);
    if (!date) {
      out.skipped.push({ date: day.date, field: "date", reason: "expected YYYY-MM-DD" });
      continue;
    }
    if (date < earliest || date > latest) {
      out.skipped.push({ date, field: "date", reason: "outside the accepted range (last 60 days)" });
      continue;
    }
    for (const [field, spec] of Object.entries(SHORTCUT_FIELDS) as Array<
      [Field, (typeof SHORTCUT_FIELDS)[Field]]
    >) {
      const raw = day[field];
      if (raw == null || raw === "") continue;
      let v = looseNumber(raw);
      if (v == null) {
        out.skipped.push({ date, field, reason: `not a number: ${String(raw).slice(0, 40)}` });
        continue;
      }
      if (field === "sleepHours") v = sleepToHours(v);
      // Zero sleep/HRV/HR/weight means "no samples" (e.g. the phone was locked), not a reading.
      if (v === 0 && field !== "steps" && field !== "activeEnergyKcal") continue;
      if (v < spec.min || v > spec.max) {
        out.skipped.push({ date, field, reason: `out of range (${spec.min}–${spec.max})` });
        continue;
      }
      const value = field === "steps" ? Math.round(v) : Math.round(v * 100) / 100;
      out.metrics.push({ kind: "metric", date, name: spec.name, value });
    }
  }
  return out;
}
