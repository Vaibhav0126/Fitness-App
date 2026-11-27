import type { SetRecord } from "../../importers/schemas";
import type { HevyWorkout } from "./client";

/** Set externalIds are `${workoutId}|${exerciseIndex}|${setIndex}`, so one workout's sets share a prefix. */
export const hevySetPrefix = (workoutId: string) => `${workoutId}|`;

const SET_TYPES = new Set(["normal", "warmup", "dropset", "failure"]);

/**
 * One Hevy workout → strength set records (same shape as the CSV importer's).
 * Cardio-style sets without reps (distance/duration only) are skipped.
 */
export function hevyWorkoutToSets(w: HevyWorkout): SetRecord[] {
  const start = new Date(w.start_time);
  if (Number.isNaN(start.getTime())) return [];
  const end = w.end_time ? new Date(w.end_time) : null;
  const performedAt = start.toISOString();
  const sessionEnd = end && !Number.isNaN(end.getTime()) && end > start ? end.toISOString() : null;
  const out: SetRecord[] = [];
  for (const ex of w.exercises) {
    for (const s of ex.sets) {
      if (s.reps == null) continue;
      const type = (s.type ?? "normal").toLowerCase();
      out.push({
        kind: "set",
        externalId: `${w.id}|${ex.index}|${s.index}`,
        sessionTitle: w.title?.slice(0, 200) ?? null,
        performedAt,
        sessionEnd,
        exerciseRaw: ex.title.slice(0, 200),
        setIndex: s.index,
        setType: SET_TYPES.has(type) ? type : "normal",
        weightKg: s.weight_kg ?? null,
        reps: Math.round(s.reps),
        rpe: s.rpe ?? null,
      });
    }
  }
  return out;
}
