import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlanConfig } from "../../engine/config";
import { user } from "./auth";

/*
 * App tables. Column names are snake_case in SQL (Drizzle `casing: "snake_case"`).
 * Every table is owned by a user and cascades on account deletion.
 *
 * `source` is free text (validated in code by the adapter registry) so new source
 * adapters don't need a migration. See docs/adr/0003-source-adapters.md.
 */

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const userId = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const unitsEnum = pgEnum("units", ["metric", "imperial"]);

export const metricNameEnum = pgEnum("metric_name", [
  "sleep_hours",
  "hrv_sdnn_ms",
  "resting_hr",
  "steps",
  "active_energy_kcal",
  "vo2max",
  "weight_kg",
  "walking_hr_avg",
]);

export const workoutTypeEnum = pgEnum("workout_type", ["run", "walk", "ride", "strength", "other"]);
export const intervalKindEnum = pgEnum("interval_kind", ["warmup", "run", "walk", "cooldown"]);
export const importStatusEnum = pgEnum("import_status", ["pending", "running", "done", "failed"]);

export const userSettings = pgTable("user_settings", {
  userId: userId().primaryKey(),
  timeZone: text().notNull().default("UTC"),
  units: unitsEnum().notNull().default("metric"),
  config: jsonb().$type<PlanConfig>().notNull(),
  onboardingDone: boolean().notNull().default(false),
  /** Bumped on every import/mutation; part of the dashboard cache key. */
  dataVersion: integer().notNull().default(0),
  ...timestamps,
});

export const uploadToken = pgTable(
  "upload_token",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    lastFour: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const connection = pgTable(
  "connection",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    provider: text().notNull(),
    /** All credential columns hold `keyId:iv:tag:ciphertext` (AES-256-GCM), never plaintext. */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    apiKeyEnc: text(),
    credentialLastFour: text(),
    expiresAt: timestamp({ withTimezone: true }),
    externalAthleteId: text(),
    lastSyncAt: timestamp({ withTimezone: true }),
    syncCursor: text(),
    status: text().notNull().default("active"),
    lastError: text(),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.provider)],
);

export const dailyMetric = pgTable(
  "daily_metric",
  {
    userId: userId(),
    date: date({ mode: "string" }).notNull(),
    name: metricNameEnum().notNull(),
    value: doublePrecision().notNull(),
    source: text().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.name, t.source] }), index().on(t.userId, t.date)],
);

export const workout = pgTable(
  "workout",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    source: text().notNull(),
    externalId: text().notNull(),
    type: workoutTypeEnum().notNull(),
    start: timestamp({ withTimezone: true }).notNull(),
    end: timestamp({ withTimezone: true }),
    durationS: integer(),
    distanceM: doublePrecision(),
    avgHr: doublePrecision(),
    maxHr: doublePrecision(),
    avgCadence: doublePrecision(),
    avgSpeedKmh: doublePrecision(),
    energyKcal: doublePrecision(),
    name: text(),
    raw: jsonb().$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.source, t.externalId), index().on(t.userId, t.start)],
);

export const workoutInterval = pgTable(
  "workout_interval",
  {
    workoutId: uuid()
      .notNull()
      .references(() => workout.id, { onDelete: "cascade" }),
    idx: smallint().notNull(),
    kind: intervalKindEnum().notNull(),
    start: timestamp({ withTimezone: true }),
    durationS: integer(),
    distanceM: doublePrecision(),
    avgSpeedKmh: doublePrecision(),
    avgHr: doublePrecision(),
    maxHr: doublePrecision(),
    cadence: doublePrecision(),
  },
  (t) => [primaryKey({ columns: [t.workoutId, t.idx] })],
);

export const strengthSet = pgTable(
  "strength_set",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    workoutId: uuid().references(() => workout.id, { onDelete: "set null" }),
    source: text().notNull(),
    /** CSV: `${sessionStartIso}|${exercise}|${setIndex}` */
    externalId: text().notNull(),
    sessionTitle: text(),
    /** Start of the session the set belongs to; sets are grouped into sessions by this value. */
    performedAt: timestamp({ withTimezone: true }).notNull(),
    exercise: text().notNull(),
    exerciseRaw: text().notNull(),
    setIndex: smallint().notNull(),
    setType: text().notNull().default("normal"),
    weightKg: doublePrecision(),
    reps: smallint(),
    rpe: doublePrecision(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.userId, t.source, t.externalId),
    index().on(t.userId, t.performedAt),
    index().on(t.userId, t.exercise),
  ],
);

export const runFeedback = pgTable(
  "run_feedback",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    workoutId: uuid().references(() => workout.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    shinPain: smallint(),
    calfPain: smallint(),
    effort: smallint(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("run_feedback_user_workout_uq")
      .on(t.userId, t.workoutId)
      .where(sql`${t.workoutId} is not null`),
    uniqueIndex("run_feedback_user_date_uq")
      .on(t.userId, t.date)
      .where(sql`${t.workoutId} is null`),
  ],
);

export const exerciseAlias = pgTable(
  "exercise_alias",
  {
    id: serial().primaryKey(),
    /** null = global seed row; set = per-user override (wins over global). */
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    /** Lower-cased, whitespace-collapsed raw name. */
    rawKey: text().notNull(),
    canonical: text().notNull(),
    muscleGroup: text(),
    isDumbbell: boolean().notNull().default(false),
    isBodyweight: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.rawKey).nullsNotDistinct()],
);

export const importJob = pgTable(
  "import_job",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    kind: text().notNull(),
    status: importStatusEnum().notNull().default("pending"),
    counts: jsonb().$type<Record<string, number>>().notNull().default({}),
    error: text(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.startedAt)],
);

/**
 * Fixed-window counters for the public ingest endpoints (spec §8: Postgres-backed limiter).
 * Not user-owned: keys are e.g. `shortcut:token:<tokenId>` or `ingest-auth:ip:<ip>`.
 */
export const ingestRateLimit = pgTable("ingest_rate_limit", {
  key: text().primaryKey(),
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull(),
});
