import "server-only";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import {
  dailyMetric,
  exerciseAlias,
  runFeedback,
  strengthSet,
  workout,
  workoutInterval,
} from "@/lib/db/schema";
import { duplicateStrengthSessions, sessionKey } from "@/lib/importers/dedupe";
import type { EngineStore, ExerciseMeta, IntervalRow, WorkoutRow } from "@/lib/engine/types";

export const STORE_WINDOW_DAYS = 365;

export interface StoreWindow {
  /** Instant: workouts/sets on or after this are loaded. */
  since: Date;
  /** Calendar date (YYYY-MM-DD): metrics/feedback on or after this are loaded. */
  sinceDate: string;
}

/** The last 365 days, extended back to planStart so run-plan progress stays complete. */
export function storeWindow(now: Date, planStart?: string): StoreWindow {
  const since = new Date(now.getTime() - STORE_WINDOW_DAYS * 86_400_000);
  const planStartInstant = planStart ? new Date(`${planStart}T00:00:00Z`) : since;
  const from = new Date(Math.min(since.getTime(), planStartInstant.getTime() - 86_400_000));
  return { since: from, sinceDate: from.toISOString().slice(0, 10) };
}

/**
 * Loads what the engine needs for one user (all reads scoped by userId):
 * the last 365 days of metrics, workouts, sets and feedback, plus, for each exercise
 * whose latest session is older than that, its latest session (for prescriptions and
 * e1RM continuity).
 */
export async function loadEngineStore(
  userId: string,
  db: Db = getDb(),
  window: StoreWindow = storeWindow(new Date()),
): Promise<EngineStore> {
  const s = scoped(userId, db);
  const [metrics, allWorkouts, intervals, recentSets, olderLatestSets, feedback, aliases] = await Promise.all(
    [
      s.select(dailyMetric, gte(dailyMetric.date, window.sinceDate)),
      s.select(workout, gte(workout.start, window.since)),
      db
        .select({ iv: workoutInterval })
        .from(workoutInterval)
        .innerJoin(workout, eq(workout.id, workoutInterval.workoutId))
        .where(and(eq(workout.userId, userId), gte(workout.start, window.since))),
      s.select(strengthSet, gte(strengthSet.performedAt, window.since)),
      db
        .select()
        .from(strengthSet)
        .where(
          and(
            eq(strengthSet.userId, userId),
            sql`(${strengthSet.exercise}, ${strengthSet.performedAt}) in (
            select exercise, max(performed_at) from strength_set
            where user_id = ${userId} and performed_at < ${window.since}
              and exercise not in (
                select exercise from strength_set where user_id = ${userId} and performed_at >= ${window.since}
              )
            group by exercise)`,
          ),
        ),
      s.select(runFeedback, gte(runFeedback.date, window.sinceDate)),
      db
        .select()
        .from(exerciseAlias)
        .where(or(isNull(exerciseAlias.userId), eq(exerciseAlias.userId, userId))),
    ],
  );
  // One session per real-world session when several sources recorded it (CSV + API).
  const dupes = duplicateStrengthSessions([...olderLatestSets, ...recentSets]);
  const sets = [...olderLatestSets, ...recentSets].filter(
    (x) => !dupes.has(sessionKey(x.source, x.performedAt)),
  );
  const workouts = allWorkouts.filter(
    (w) => w.type !== "strength" || !dupes.has(sessionKey(w.source, w.start)),
  );

  const ivByWorkout = new Map<string, IntervalRow[]>();
  for (const { iv } of intervals) {
    const list = ivByWorkout.get(iv.workoutId) ?? [];
    list.push({
      idx: iv.idx,
      kind: iv.kind,
      durationS: iv.durationS,
      distanceM: iv.distanceM,
      avgSpeedKmh: iv.avgSpeedKmh,
      avgHr: iv.avgHr,
      maxHr: iv.maxHr,
      cadence: iv.cadence,
    });
    ivByWorkout.set(iv.workoutId, list);
  }

  const exercises: Record<string, ExerciseMeta> = {};
  // Global rows first, then per-user overrides win.
  for (const a of [...aliases].sort((x, y) => Number(x.userId != null) - Number(y.userId != null))) {
    exercises[a.canonical] = {
      muscleGroup: a.muscleGroup,
      isDumbbell: a.isDumbbell,
      isBodyweight: a.isBodyweight,
    };
  }

  return {
    metrics: metrics.map((m) => ({ date: m.date, name: m.name, value: m.value, source: m.source })),
    workouts: workouts.map((w): WorkoutRow => ({
      id: w.id,
      source: w.source,
      type: w.type,
      start: w.start.toISOString(),
      durationS: w.durationS,
      distanceM: w.distanceM,
      avgHr: w.avgHr,
      maxHr: w.maxHr,
      avgCadence: w.avgCadence,
      avgSpeedKmh: w.avgSpeedKmh,
      name: w.name,
      intervals: ivByWorkout.get(w.id) ?? [],
    })),
    sets: sets.map((x) => ({
      performedAt: x.performedAt.toISOString(),
      sessionTitle: x.sessionTitle,
      exercise: x.exercise,
      setIndex: x.setIndex,
      setType: x.setType,
      weightKg: x.weightKg,
      reps: x.reps,
    })),
    feedback: feedback.map((f) => ({
      workoutId: f.workoutId,
      date: f.date,
      shinPain: f.shinPain,
      calfPain: f.calfPain,
      effort: f.effort,
    })),
    exercises,
  };
}
