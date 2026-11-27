import "server-only";
import { eq, isNull, or } from "drizzle-orm";
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
import type { EngineStore, ExerciseMeta, IntervalRow, WorkoutRow } from "@/lib/engine/types";

/** Loads everything the engine needs for one user. All reads are scoped by userId. */
export async function loadEngineStore(userId: string, db: Db = getDb()): Promise<EngineStore> {
  const s = scoped(userId, db);
  const [metrics, workouts, intervals, sets, feedback, aliases] = await Promise.all([
    s.select(dailyMetric),
    s.select(workout),
    db
      .select({ iv: workoutInterval })
      .from(workoutInterval)
      .innerJoin(workout, eq(workout.id, workoutInterval.workoutId))
      .where(eq(workout.userId, userId)),
    s.select(strengthSet),
    s.select(runFeedback),
    db
      .select()
      .from(exerciseAlias)
      .where(or(isNull(exerciseAlias.userId), eq(exerciseAlias.userId, userId))),
  ]);

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
