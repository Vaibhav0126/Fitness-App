import "server-only";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDb, type Db } from "@/lib/db/client";
import { dailyMetric, exerciseAlias, strengthSet, workout, workoutInterval } from "@/lib/db/schema";
import { aliasKey } from "@/lib/exercises/catalog";
import type { MetricRecord, SetRecord, WorkoutRecord } from "@/lib/importers/schemas";

/*
 * Idempotent merge-upserts (spec §4):
 *   - key: (userId, source, externalId) — or the daily_metric primary key;
 *   - a null in the incoming row never overwrites a stored value (COALESCE);
 *   - rows whose merged values equal the stored ones are not touched, so re-imports
 *     report them as "unchanged".
 * Counts come from RETURNING (xmax = 0): true = inserted, false = updated.
 */

export interface MergeCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

const zero = (): MergeCounts => ({ inserted: 0, updated: 0, unchanged: 0 });

export function addCounts(a: MergeCounts, b: MergeCounts): MergeCounts {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
  };
}

/** SQL name of a column under `casing: "snake_case"` (columns are declared without explicit names). */
const sqlName = (col: PgColumn) => col.name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const excluded = (col: PgColumn) => sql.raw(`excluded."${sqlName(col)}"`);
const coalesce = (col: PgColumn) => sql`coalesce(${excluded(col)}, ${col})`;
/** WHERE clause: at least one merged column differs from the stored value. */
const anyChanged = (cols: PgColumn[], merged: (c: PgColumn) => SQL) =>
  sql.join(
    cols.map((c) => sql`${c} is distinct from ${merged(c)}`),
    sql` or `,
  );

function tally(total: number, returned: Array<{ inserted: boolean }>): MergeCounts {
  const inserted = returned.filter((r) => r.inserted).length;
  const updated = returned.length - inserted;
  return { inserted, updated, unchanged: total - returned.length };
}

const insertedFlag = sql<boolean>`(xmax = 0)`;

// ---------- metrics ----------
export async function mergeMetrics(
  userId: string,
  source: string,
  rows: MetricRecord[],
  db: Db = getDb(),
): Promise<MergeCounts> {
  if (!rows.length) return zero();
  // Last row wins for duplicate keys inside one batch.
  const byKey = new Map(rows.map((r) => [`${r.date}|${r.name}`, r]));
  const values = [...byKey.values()].map((r) => ({
    userId,
    source,
    date: r.date,
    name: r.name,
    value: r.value,
  }));
  const returned = await db
    .insert(dailyMetric)
    .values(values)
    .onConflictDoUpdate({
      target: [dailyMetric.userId, dailyMetric.date, dailyMetric.name, dailyMetric.source],
      set: { value: sql`excluded.value`, updatedAt: new Date() },
      setWhere: sql`${dailyMetric.value} is distinct from excluded.value`,
    })
    .returning({ inserted: insertedFlag });
  return tally(values.length, returned);
}

// ---------- workouts (+ intervals) ----------
const WORKOUT_MERGE_COLS = [
  workout.type,
  workout.start,
  workout.end,
  workout.durationS,
  workout.distanceM,
  workout.avgHr,
  workout.maxHr,
  workout.avgCadence,
  workout.avgSpeedKmh,
  workout.energyKcal,
  workout.name,
];

const INTERVAL_MERGE_COLS = [
  workoutInterval.kind,
  workoutInterval.start,
  workoutInterval.durationS,
  workoutInterval.distanceM,
  workoutInterval.avgSpeedKmh,
  workoutInterval.avgHr,
  workoutInterval.maxHr,
  workoutInterval.cadence,
];

export async function mergeWorkouts(
  userId: string,
  source: string,
  rows: WorkoutRecord[],
  db: Db = getDb(),
): Promise<MergeCounts & { intervals: MergeCounts }> {
  if (!rows.length) return { ...zero(), intervals: zero() };
  const byKey = new Map(rows.map((r) => [r.externalId, r]));
  const list = [...byKey.values()];
  const values = list.map((r) => ({
    userId,
    source,
    externalId: r.externalId,
    type: r.type,
    start: new Date(r.start),
    end: r.end ? new Date(r.end) : null,
    durationS: r.durationS ?? null,
    distanceM: r.distanceM ?? null,
    avgHr: r.avgHr ?? null,
    maxHr: r.maxHr ?? null,
    avgCadence: r.avgCadence ?? null,
    avgSpeedKmh: r.avgSpeedKmh ?? null,
    energyKcal: r.energyKcal ?? null,
    name: r.name ?? null,
  }));
  const set = Object.fromEntries(WORKOUT_MERGE_COLS.map((c) => [keyOf(workout, c), coalesce(c)]));
  const returned = await db
    .insert(workout)
    .values(values)
    .onConflictDoUpdate({
      target: [workout.userId, workout.source, workout.externalId],
      set: { ...set, updatedAt: new Date() },
      setWhere: anyChanged(WORKOUT_MERGE_COLS, coalesce),
    })
    .returning({ inserted: insertedFlag });
  const counts = tally(values.length, returned);

  // Resolve ids for all rows (unchanged rows aren't returned by the upsert).
  const withIntervals = list.filter((r) => r.intervals?.length);
  let intervals = zero();
  if (withIntervals.length) {
    const ids = await db
      .select({ id: workout.id, externalId: workout.externalId })
      .from(workout)
      .where(
        and(
          eq(workout.userId, userId),
          eq(workout.source, source),
          inArray(
            workout.externalId,
            withIntervals.map((r) => r.externalId),
          ),
        ),
      );
    const idOf = new Map(ids.map((r) => [r.externalId, r.id]));
    const ivValues = withIntervals.flatMap((r) =>
      (r.intervals ?? []).map((iv) => ({
        workoutId: idOf.get(r.externalId)!,
        idx: iv.idx,
        kind: iv.kind,
        start: iv.start ? new Date(iv.start) : null,
        durationS: iv.durationS ?? null,
        distanceM: iv.distanceM ?? null,
        avgSpeedKmh: iv.avgSpeedKmh ?? null,
        avgHr: iv.avgHr ?? null,
        maxHr: iv.maxHr ?? null,
        cadence: iv.cadence ?? null,
      })),
    );
    const ivSet = Object.fromEntries(
      INTERVAL_MERGE_COLS.map((c) => [keyOf(workoutInterval, c), coalesce(c)]),
    );
    const ivReturned = await db
      .insert(workoutInterval)
      .values(ivValues)
      .onConflictDoUpdate({
        target: [workoutInterval.workoutId, workoutInterval.idx],
        set: ivSet,
        setWhere: anyChanged(INTERVAL_MERGE_COLS, coalesce),
      })
      .returning({ inserted: insertedFlag });
    intervals = tally(ivValues.length, ivReturned);
  }
  return { ...counts, intervals };
}

// ---------- strength sets (+ one strength workout per session) ----------
export async function exerciseResolver(userId: string, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(exerciseAlias)
    .where(or(isNull(exerciseAlias.userId), eq(exerciseAlias.userId, userId)));
  const map = new Map<string, string>();
  for (const r of rows.filter((x) => x.userId == null)) map.set(r.rawKey, r.canonical);
  for (const r of rows.filter((x) => x.userId != null)) map.set(r.rawKey, r.canonical); // overrides
  return {
    resolve: (raw: string) => map.get(aliasKey(raw)) ?? raw.trim().replace(/\s+/g, " "),
    known: (raw: string) => map.has(aliasKey(raw)),
  };
}

const SET_MERGE_COLS = [
  strengthSet.workoutId,
  strengthSet.sessionTitle,
  strengthSet.performedAt,
  strengthSet.exercise,
  strengthSet.exerciseRaw,
  strengthSet.setIndex,
  strengthSet.setType,
  strengthSet.weightKg,
  strengthSet.reps,
  strengthSet.rpe,
];

export async function mergeSets(
  userId: string,
  source: string,
  rows: SetRecord[],
  db: Db = getDb(),
): Promise<MergeCounts & { unknownExercises: string[]; sessions: MergeCounts }> {
  if (!rows.length) return { ...zero(), unknownExercises: [], sessions: zero() };
  const { resolve, known } = await exerciseResolver(userId, db);
  const byKey = new Map(rows.map((r) => [r.externalId, r]));
  const list = [...byKey.values()];

  // One strength workout per session start.
  const sessions = new Map<string, WorkoutRecord>();
  for (const r of list) {
    const end = r.sessionEnd ?? null;
    const existing = sessions.get(r.performedAt);
    if (!existing) {
      sessions.set(r.performedAt, {
        kind: "workout",
        externalId: `session|${r.performedAt}`,
        type: "strength",
        start: r.performedAt,
        end,
        durationS: end ? Math.round((Date.parse(end) - Date.parse(r.performedAt)) / 1000) : null,
        name: r.sessionTitle ?? null,
      });
    }
  }
  const sessionCounts = await mergeWorkouts(userId, source, [...sessions.values()], db);
  const sessionIds = await db
    .select({ id: workout.id, start: workout.start })
    .from(workout)
    .where(
      and(
        eq(workout.userId, userId),
        eq(workout.source, source),
        eq(workout.type, "strength"),
        inArray(
          workout.externalId,
          [...sessions.values()].map((s) => s.externalId),
        ),
      ),
    );
  const sessionIdOf = new Map(sessionIds.map((s) => [s.start.toISOString(), s.id]));

  const unknown = new Set<string>();
  const values = list.map((r) => {
    if (!known(r.exerciseRaw)) unknown.add(r.exerciseRaw);
    return {
      userId,
      source,
      externalId: r.externalId,
      workoutId: sessionIdOf.get(new Date(r.performedAt).toISOString()) ?? null,
      sessionTitle: r.sessionTitle ?? null,
      performedAt: new Date(r.performedAt),
      exercise: resolve(r.exerciseRaw),
      exerciseRaw: r.exerciseRaw,
      setIndex: r.setIndex,
      setType: r.setType ?? "normal",
      weightKg: r.weightKg ?? null,
      reps: r.reps ?? null,
      rpe: r.rpe ?? null,
    };
  });
  // Exercise names re-resolve on every import (alias changes apply); other columns coalesce.
  const merged = (c: PgColumn) => (c === strengthSet.exercise ? excluded(c) : coalesce(c));
  const set = Object.fromEntries(SET_MERGE_COLS.map((c) => [keyOf(strengthSet, c), merged(c)]));
  const returned = await db
    .insert(strengthSet)
    .values(values)
    .onConflictDoUpdate({
      target: [strengthSet.userId, strengthSet.source, strengthSet.externalId],
      set: { ...set, updatedAt: new Date() },
      setWhere: anyChanged(SET_MERGE_COLS, merged),
    })
    .returning({ inserted: insertedFlag });
  return {
    ...tally(values.length, returned),
    unknownExercises: [...unknown].sort(),
    sessions: sessionCounts,
  };
}

/** Drizzle `set` objects are keyed by the JS property name, not the SQL column name. */
function keyOf(table: object, col: PgColumn): string {
  const entry = Object.entries(table).find(([, v]) => v === col);
  if (!entry) throw new Error(`column ${col.name} not on table`);
  return entry[0];
}
