import { z } from "zod";
import type { NormalizedMetric, NormalizedWorkout } from "../importers/adapter";
import { parseDateTime } from "./datetime";

/*
 * Health Auto Export (v2 JSON) → normalized metrics and workouts. Pure; runs in a Web Worker.
 *
 * Metrics: data.metrics[] = { name, units, data: [{ date, qty } | { date, Avg, Min, Max } | sleep fields] }
 * Workouts: data.workouts[] = { id, name, start, end, duration, distance, heartRate, activities[] (intervals),
 *           heartRateData[] (per minute), stepCount[] (per minute) }
 * Dates look like "2026-11-21 6:05:47 AM +0900", often with U+202F before AM/PM.
 */

// ---------- lenient input schemas ----------
const qtyLike = z
  .union([z.number(), z.object({ qty: z.number().nullish(), units: z.string().nullish() }).passthrough()])
  .nullish();

const metricPoint = z
  .object({
    date: z.string(),
    qty: z.number().nullish(),
    Avg: z.number().nullish(),
    Min: z.number().nullish(),
    Max: z.number().nullish(),
    // sleep_analysis (aggregated)
    totalSleep: z.number().nullish(),
    asleep: z.number().nullish(),
    core: z.number().nullish(),
    deep: z.number().nullish(),
    rem: z.number().nullish(),
    sleepEnd: z.string().nullish(),
  })
  .passthrough();

const metricSchema = z
  .object({ name: z.string(), units: z.string().nullish(), data: z.array(metricPoint) })
  .passthrough();

const minuteSample = z
  .object({
    date: z.string(),
    qty: z.number().nullish(),
    Avg: z.number().nullish(),
    Max: z.number().nullish(),
  })
  .passthrough();

/** Per-interval values. Real HAE exports nest them under `metrics`; older/other shapes put them top-level. */
const intervalValues = {
  distance: qtyLike,
  speed: qtyLike,
  heartRateAverage: qtyLike,
  heartRateMaximum: qtyLike,
  activeDuration: qtyLike,
  elapsedDuration: qtyLike,
};

const activitySchema = z
  .object({
    index: z.number().nullish(),
    start: z.string().nullish(),
    end: z.string().nullish(),
    duration: z.number().nullish(),
    activityType: z.string().nullish(),
    ...intervalValues,
    metrics: z.object(intervalValues).passthrough().nullish(),
  })
  .passthrough();

const workoutSchema = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    start: z.string(),
    end: z.string().nullish(),
    duration: z.number().nullish(),
    distance: qtyLike,
    activeEnergyBurned: qtyLike,
    heartRate: z.object({ avg: qtyLike, max: qtyLike, min: qtyLike }).passthrough().nullish(),
    avgHeartRate: qtyLike,
    maxHeartRate: qtyLike,
    heartRateData: z.array(minuteSample).nullish(),
    stepCount: z.array(minuteSample).nullish(),
    activities: z.array(activitySchema).nullish(),
    intervals: z.array(activitySchema).nullish(),
  })
  .passthrough();

export const haeFileSchema = z
  .object({
    data: z
      .object({ metrics: z.array(metricSchema).nullish(), workouts: z.array(workoutSchema).nullish() })
      .passthrough(),
  })
  .passthrough();

type Qty = z.infer<typeof qtyLike>;
const qty = (v: Qty): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return v.qty != null && Number.isFinite(v.qty) ? v.qty : null;
};
const unitsOf = (v: Qty): string | null => (v != null && typeof v === "object" ? (v.units ?? null) : null);

// ---------- metrics ----------
const METRIC_MAP: Record<string, NormalizedMetric["name"]> = {
  heart_rate_variability: "hrv_sdnn_ms",
  resting_heart_rate: "resting_hr",
  step_count: "steps",
  sleep_analysis: "sleep_hours",
  active_energy: "active_energy_kcal",
  vo2_max: "vo2max",
  walking_heart_rate_average: "walking_hr_avg",
  weight_body_mass: "weight_kg",
};

/** How several readings on one day combine. */
const COMBINE: Record<NormalizedMetric["name"], "sum" | "mean" | "last"> = {
  steps: "sum",
  active_energy_kcal: "sum",
  sleep_hours: "sum",
  hrv_sdnn_ms: "mean",
  resting_hr: "mean",
  walking_hr_avg: "mean",
  vo2max: "last",
  weight_kg: "last",
};

function convert(name: NormalizedMetric["name"], value: number, units: string | null | undefined): number {
  const u = (units ?? "").toLowerCase();
  if (name === "weight_kg" && (u === "lb" || u === "lbs")) return value * 0.45359237;
  if (name === "active_energy_kcal" && u === "kj") return value / 4.184;
  if (name === "sleep_hours" && (u === "min" || u === "minutes")) return value / 60;
  return value;
}

export function sleepHours(p: z.infer<typeof metricPoint>): number | null {
  if (p.totalSleep != null) return p.totalSleep;
  if (p.asleep != null && p.asleep > 0) return p.asleep;
  const parts = [p.core, p.deep, p.rem].filter((x): x is number => x != null);
  if (parts.length) return parts.reduce((a, b) => a + b, 0);
  return p.qty ?? null;
}

export interface HaeParseResult {
  metrics: NormalizedMetric[];
  workouts: NormalizedWorkout[];
  skipped: Array<{ item: string; reason: string }>;
  unknownMetrics: string[];
}

export function parseHaeMetrics(
  metrics: z.infer<typeof metricSchema>[],
  timeZone: string,
  out: HaeParseResult,
) {
  const acc = new Map<string, { name: NormalizedMetric["name"]; date: string; values: number[] }>();
  for (const m of metrics) {
    const name = METRIC_MAP[m.name];
    if (!name) {
      if (!out.unknownMetrics.includes(m.name)) out.unknownMetrics.push(m.name);
      continue;
    }
    for (const p of m.data) {
      let raw: number | null;
      let dateStr = p.date;
      if (name === "sleep_hours") {
        raw = sleepHours(p);
        // Attribute a night to the wake-up date.
        if (p.sleepEnd) dateStr = p.sleepEnd;
      } else raw = p.qty ?? p.Avg ?? null;
      if (raw == null || !Number.isFinite(raw)) continue;
      let date: string;
      try {
        date = parseDateTime(dateStr, timeZone).localDate;
      } catch (e) {
        out.skipped.push({ item: `${m.name} ${p.date}`, reason: (e as Error).message });
        continue;
      }
      const key = `${name}|${date}`;
      const entry = acc.get(key) ?? { name, date, values: [] };
      entry.values.push(convert(name, raw, m.units));
      acc.set(key, entry);
    }
  }
  for (const { name, date, values } of acc.values()) {
    const how = COMBINE[name];
    const v =
      how === "sum"
        ? values.reduce((a, b) => a + b, 0)
        : how === "mean"
          ? values.reduce((a, b) => a + b, 0) / values.length
          : values[values.length - 1]!;
    const value = name === "steps" ? Math.round(v) : Math.round(v * 100) / 100;
    out.metrics.push({ kind: "metric", name, date, value });
  }
  out.metrics.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
}

// ---------- workouts ----------
export function workoutType(name: string | null | undefined): NormalizedWorkout["type"] {
  const n = (name ?? "").toLowerCase();
  if (/run/.test(n)) return "run";
  if (/walk|hik/.test(n)) return "walk";
  if (/cycl|bike|ride/.test(n)) return "ride";
  if (/strength|weight|lift|functional|core training/.test(n)) return "strength";
  return "other";
}

/** Workout totals default to km when units are missing; interval values default to m. */
function distanceMeters(v: Qty, defaultUnit: "km" | "m" = "km"): number | null {
  const d = qty(v);
  if (d == null) return null;
  const u = (unitsOf(v) ?? defaultUnit).toLowerCase();
  if (u === "m") return d;
  if (u === "mi") return d * 1609.344;
  if (u === "yd") return d * 0.9144;
  return d * 1000; // km
}

/** Durations are seconds unless units say minutes/hours. */
function seconds(v: Qty): number | null {
  const n = qty(v);
  if (n == null) return null;
  const u = (unitsOf(v) ?? "s").toLowerCase();
  if (u.startsWith("min")) return n * 60;
  if (u === "h" || u.startsWith("hr") || u.startsWith("hour")) return n * 3600;
  return n;
}

/** HAE interval speed is m/s unless units say otherwise. */
function speedKmh(v: Qty): number | null {
  const s = qty(v);
  if (s == null) return null;
  const u = (unitsOf(v) ?? "m/s").toLowerCase();
  if (u.includes("km/h") || u === "kph") return s;
  if (u.includes("mph") || u.includes("mi/h")) return s * 1.609344;
  return s * 3.6;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

interface Sample {
  t: number;
  avg: number | null;
  max: number | null;
  qty: number | null;
}

function samples(list: z.infer<typeof minuteSample>[] | null | undefined, tz: string): Sample[] {
  const out: Sample[] = [];
  for (const s of list ?? []) {
    try {
      out.push({
        t: parseDateTime(s.date, tz).instant.getTime(),
        avg: s.Avg ?? null,
        max: s.Max ?? null,
        qty: s.qty ?? null,
      });
    } catch {
      /* skip unparseable sample */
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

const inWindow = (list: Sample[], from: number, to: number) => list.filter((s) => s.t >= from && s.t < to);

/**
 * Run-walk classification: leading slow intervals = warm-up, the final interval (after
 * the last run) = cool-down, the rest = run if speed > walk speed + margin, else walk.
 */
export function classifyIntervals(
  speeds: Array<number | null>,
  cls: { walkSpeedKmh: number; marginKmh: number },
): Array<"warmup" | "run" | "walk" | "cooldown"> {
  const threshold = cls.walkSpeedKmh + cls.marginKmh;
  const isRun = speeds.map((s) => s != null && s > threshold);
  const first = isRun.indexOf(true);
  const last = isRun.lastIndexOf(true);
  return speeds.map((_, i) => {
    if (first === -1)
      return i === 0 ? "warmup" : i === speeds.length - 1 && speeds.length > 1 ? "cooldown" : "walk";
    if (i < first) return "warmup";
    if (i > last && i === speeds.length - 1) return "cooldown";
    return isRun[i] ? "run" : "walk";
  });
}

const roundOrNull = (v: number | null | undefined) => (v != null ? Math.round(v) : null);

export function parseHaeWorkouts(
  workouts: z.infer<typeof workoutSchema>[],
  timeZone: string,
  cls: { walkSpeedKmh: number; marginKmh: number },
  out: HaeParseResult,
) {
  for (const w of workouts) {
    try {
      const start = parseDateTime(w.start, timeZone).instant;
      const end = w.end ? parseDateTime(w.end, timeZone).instant : null;
      const type = workoutType(w.name);
      const hr = samples(w.heartRateData, timeZone);
      const steps = samples(w.stepCount, timeZone);
      const durationS =
        w.duration != null
          ? Math.round(w.duration)
          : end
            ? Math.round((end.getTime() - start.getTime()) / 1000)
            : null;
      const distanceM = distanceMeters(w.distance);

      const acts = [...(w.activities ?? w.intervals ?? [])];
      if (acts.every((a) => a.index != null)) acts.sort((a, b) => a.index! - b.index!);
      let cursor = start.getTime();
      const rawIntervals = acts.map((a) => {
        // a.metrics.* first (real exports), then top-level fields.
        const v = <K extends keyof typeof intervalValues>(k: K): Qty => a.metrics?.[k] ?? a[k];
        const aStart = a.start ? parseDateTime(a.start, timeZone).instant.getTime() : cursor;
        const aEnd = a.end
          ? parseDateTime(a.end, timeZone).instant.getTime()
          : a.duration != null
            ? aStart + a.duration * 1000
            : aStart;
        cursor = aEnd;
        const dist = distanceMeters(v("distance"), "m");
        const dur =
          a.duration ??
          seconds(v("activeDuration")) ??
          seconds(v("elapsedDuration")) ??
          (aEnd - aStart) / 1000;
        let spd = speedKmh(v("speed"));
        if (spd == null && dist != null && dur > 0) spd = (dist / dur) * 3.6;
        const hrIn = inWindow(hr, aStart, aEnd);
        const stepIn = inWindow(steps, aStart, aEnd)
          .map((s) => s.qty)
          .filter((q): q is number => q != null);
        const hrAvgs = hrIn.map((s) => s.avg).filter((v): v is number => v != null);
        const hrMaxes = hrIn.map((s) => s.max ?? s.avg).filter((v): v is number => v != null);
        return {
          start: new Date(aStart).toISOString(),
          durationS: Math.round(dur),
          distanceM: dist != null ? Math.round(dist * 10) / 10 : null,
          avgSpeedKmh: spd != null ? r1(spd) : null,
          avgHr: roundOrNull(qty(v("heartRateAverage")) ?? (hrAvgs.length ? mean(hrAvgs) : null)),
          maxHr: roundOrNull(qty(v("heartRateMaximum")) ?? (hrMaxes.length ? Math.max(...hrMaxes) : null)),
          cadence: stepIn.length ? Math.round(mean(stepIn)!) : null,
        };
      });
      const kinds =
        type === "run"
          ? classifyIntervals(
              rawIntervals.map((i) => i.avgSpeedKmh),
              cls,
            )
          : rawIntervals.map(() => "walk" as const);

      const allSteps = steps.map((s) => s.qty).filter((q): q is number => q != null);
      const avgHr = qty(w.heartRate?.avg) ?? qty(w.avgHeartRate);
      const maxHr =
        qty(w.heartRate?.max) ??
        qty(w.maxHeartRate) ??
        (hr.length ? Math.max(...hr.map((s) => s.max ?? s.avg ?? 0)) : null);
      const energy = qty(w.activeEnergyBurned);
      const energyKcal =
        energy != null && (unitsOf(w.activeEnergyBurned) ?? "kcal").toLowerCase() === "kj"
          ? energy / 4.184
          : energy;

      out.workouts.push({
        kind: "workout",
        externalId: w.id,
        type,
        name: w.name ?? null,
        start: start.toISOString(),
        end: end ? end.toISOString() : null,
        durationS,
        distanceM: distanceM != null ? Math.round(distanceM) : null,
        avgHr: avgHr != null ? Math.round(avgHr) : null,
        maxHr: maxHr != null && maxHr > 0 ? Math.round(maxHr) : null,
        avgCadence: allSteps.length ? Math.round(mean(allSteps)!) : null,
        avgSpeedKmh: distanceM != null && durationS ? r1((distanceM / durationS) * 3.6) : null,
        energyKcal: energyKcal != null ? Math.round(energyKcal) : null,
        intervals:
          type === "run" || type === "walk"
            ? rawIntervals.map((iv, idx) => ({ idx, kind: kinds[idx]!, ...iv }))
            : [],
      });
    } catch (e) {
      out.skipped.push({ item: `workout ${w.id}`, reason: (e as Error).message });
    }
  }
}

/** Parses a whole HAE export (Metrics.json, Workouts.json, or a combined file). */
export function parseHaeFile(
  json: unknown,
  opts: { timeZone: string; runClassification: { walkSpeedKmh: number; marginKmh: number } },
): HaeParseResult {
  const parsed = haeFileSchema.safeParse(json);
  if (!parsed.success)
    throw new Error("Not a Health Auto Export JSON file (expected a top-level `data` object).");
  const out: HaeParseResult = { metrics: [], workouts: [], skipped: [], unknownMetrics: [] };
  parseHaeMetrics(parsed.data.data.metrics ?? [], opts.timeZone, out);
  parseHaeWorkouts(parsed.data.data.workouts ?? [], opts.timeZone, opts.runClassification, out);
  return out;
}
