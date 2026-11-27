import { z } from "zod";

/** Server-side validation of normalized records sent by the browser (spec §8: validate everything). */

const isoInstant = z.iso.datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = (min = 0, max = 1e7) => z.number().finite().min(min).max(max).nullish();

export const metricRecordSchema = z.object({
  kind: z.literal("metric"),
  date: isoDate,
  name: z.enum([
    "sleep_hours",
    "hrv_sdnn_ms",
    "resting_hr",
    "steps",
    "active_energy_kcal",
    "vo2max",
    "weight_kg",
    "walking_hr_avg",
  ]),
  value: z.number().finite().min(0).max(1e6),
});

export const intervalRecordSchema = z.object({
  idx: z.number().int().min(0).max(500),
  kind: z.enum(["warmup", "run", "walk", "cooldown"]),
  start: isoInstant.nullish(),
  durationS: n(0, 86_400),
  distanceM: n(0, 1e6),
  avgSpeedKmh: n(0, 100),
  avgHr: n(0, 260),
  maxHr: n(0, 260),
  cadence: n(0, 400),
});

export const workoutRecordSchema = z.object({
  kind: z.literal("workout"),
  externalId: z.string().min(1).max(200),
  type: z.enum(["run", "walk", "ride", "strength", "other"]),
  start: isoInstant,
  end: isoInstant.nullish(),
  durationS: n(0, 7 * 86_400),
  distanceM: n(0, 1e7),
  avgHr: n(0, 260),
  maxHr: n(0, 260),
  avgCadence: n(0, 400),
  avgSpeedKmh: n(0, 100),
  energyKcal: n(0, 1e5),
  name: z.string().max(200).nullish(),
  intervals: z.array(intervalRecordSchema).max(500).optional(),
});

export const setRecordSchema = z.object({
  kind: z.literal("set"),
  externalId: z.string().min(1).max(300),
  sessionTitle: z.string().max(200).nullish(),
  performedAt: isoInstant,
  sessionEnd: isoInstant.nullish(),
  exerciseRaw: z.string().min(1).max(200),
  setIndex: z.number().int().min(0).max(1000),
  setType: z.string().max(30).nullish(),
  weightKg: n(0, 1000),
  reps: z.number().int().min(0).max(1000).nullish(),
  rpe: n(0, 10),
});

export const importSourceSchema = z.enum(["csv_hevy", "csv_strong", "csv", "hae", "manual"]);

export const MAX_ROWS_PER_BATCH = 2000;

export const batchRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("metrics"),
    source: importSourceSchema,
    jobId: z.uuid().optional(),
    fileName: z.string().max(200).optional(),
    final: z.boolean().optional(),
    rows: z.array(metricRecordSchema).max(MAX_ROWS_PER_BATCH),
  }),
  z.object({
    kind: z.literal("workouts"),
    source: importSourceSchema,
    jobId: z.uuid().optional(),
    fileName: z.string().max(200).optional(),
    final: z.boolean().optional(),
    rows: z.array(workoutRecordSchema).max(MAX_ROWS_PER_BATCH),
  }),
  z.object({
    kind: z.literal("sets"),
    source: importSourceSchema,
    jobId: z.uuid().optional(),
    fileName: z.string().max(200).optional(),
    final: z.boolean().optional(),
    rows: z.array(setRecordSchema).max(MAX_ROWS_PER_BATCH),
  }),
]);

export type BatchRequest = z.infer<typeof batchRequestSchema>;
export type MetricRecord = z.infer<typeof metricRecordSchema>;
export type WorkoutRecord = z.infer<typeof workoutRecordSchema>;
export type SetRecord = z.infer<typeof setRecordSchema>;
