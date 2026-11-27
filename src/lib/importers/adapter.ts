import type { z } from "zod";

/*
 * Source adapters (docs/adr/0003-source-adapters.md).
 *
 * Every data source (CSV, Health Auto Export, Apple Health export, GPX/FIT/TCX, Hevy API,
 * manual logger, and later optionally Strava) is an adapter that turns its native
 * format into the same normalized records. The importer core then merges them into
 * the database idempotently: upsert on (userId, source, externalId); a null in a new
 * import never overwrites a stored value.
 */

export type SourceId =
  | "manual"
  | "csv_hevy"
  | "csv_strong"
  | "csv"
  | "shortcut"
  | "hae"
  | "apple_health"
  | "gpx"
  | "fit"
  | "tcx"
  | "hevy_api"
  | "demo";

export interface NormalizedMetric {
  kind: "metric";
  date: string;
  name:
    | "sleep_hours"
    | "hrv_sdnn_ms"
    | "resting_hr"
    | "steps"
    | "active_energy_kcal"
    | "vo2max"
    | "weight_kg"
    | "walking_hr_avg";
  value: number;
}

export interface NormalizedWorkout {
  kind: "workout";
  externalId: string;
  type: "run" | "walk" | "ride" | "strength" | "other";
  start: string;
  end?: string | null;
  durationS?: number | null;
  distanceM?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgCadence?: number | null;
  avgSpeedKmh?: number | null;
  energyKcal?: number | null;
  name?: string | null;
  intervals?: Array<{
    idx: number;
    kind: "warmup" | "run" | "walk" | "cooldown";
    start?: string | null;
    durationS?: number | null;
    distanceM?: number | null;
    avgSpeedKmh?: number | null;
    avgHr?: number | null;
    maxHr?: number | null;
    cadence?: number | null;
  }>;
}

export interface NormalizedSet {
  kind: "set";
  externalId: string;
  sessionTitle?: string | null;
  performedAt: string;
  exerciseRaw: string;
  setIndex: number;
  setType?: string | null;
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
}

export type NormalizedRecord = NormalizedMetric | NormalizedWorkout | NormalizedSet;

export interface SourceAdapter<Raw> {
  id: SourceId;
  /** Human label, e.g. "Hevy CSV" */
  label: string;
  /** Zod schema for one raw row/item, validated before normalization. */
  rowSchema: z.ZodType<Raw>;
  /** Pure: raw row (already validated) → normalized records. */
  normalize(row: Raw, ctx: { timeZone: string }): NormalizedRecord[];
  /** Where parsing happens. Raw health files never leave the browser. */
  runsIn: "browser" | "server";
}
