import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { dailyMetric, runFeedback, strengthSet, user, userSettings, workout } from "@/lib/db/schema";
import { DEMO_EMAIL, DEMO_NAME, DEMO_TIME_ZONE, DEMO_USER_ID } from "@/lib/demo/constants";
import { generateDemoData } from "@/lib/demo/generate";
import type { SetRecord, WorkoutRecord } from "@/lib/importers/schemas";
import { bumpDataVersion } from "../cache";
import { mergeMetrics, mergeSets, mergeWorkouts } from "../importers/merge";

const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * (Re)creates the read-only demo user with fresh synthetic data anchored to `now`.
 * Run by `pnpm db:seed` and, from Phase 2, by the daily cron.
 */
export async function regenerateDemo(db: Db, now = new Date()) {
  const data = generateDemoData(now);
  await db
    .insert(user)
    .values({ id: DEMO_USER_ID, name: DEMO_NAME, email: DEMO_EMAIL, emailVerified: true, isDemo: true })
    .onConflictDoUpdate({ target: user.id, set: { isDemo: true, emailVerified: true, name: DEMO_NAME } });
  await db
    .insert(userSettings)
    .values({ userId: DEMO_USER_ID, timeZone: DEMO_TIME_ZONE, config: data.config, onboardingDone: true })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { config: data.config, timeZone: DEMO_TIME_ZONE, onboardingDone: true },
    });

  const s = scoped(DEMO_USER_ID, db);
  await s.delete(runFeedback);
  await s.delete(strengthSet);
  await s.delete(workout);
  await s.delete(dailyMetric);

  for (const c of chunk(data.metrics, 1000)) await mergeMetrics(DEMO_USER_ID, "demo", c, db);
  for (const c of chunk(data.workouts as WorkoutRecord[], 200))
    await mergeWorkouts(DEMO_USER_ID, "demo", c, db);
  for (const c of chunk(data.sets as SetRecord[], 1000)) await mergeSets(DEMO_USER_ID, "demo", c, db);

  const ids = await db
    .select({ id: workout.id, externalId: workout.externalId })
    .from(workout)
    .where(
      sql`${s.owns(workout)} and ${inArray(
        workout.externalId,
        data.feedback.map((f) => f.workoutExternalId),
      )}`,
    );
  const idOf = new Map(ids.map((r) => [r.externalId, r.id]));
  if (data.feedback.length) {
    await s.insert(
      runFeedback,
      data.feedback.map((f) => ({
        workoutId: idOf.get(f.workoutExternalId) ?? null,
        date: f.date,
        shinPain: f.shinPain,
        calfPain: f.calfPain,
        effort: f.effort,
      })),
    );
  }
  await bumpDataVersion(DEMO_USER_ID, db);
  return {
    metrics: data.metrics.length,
    workouts: data.workouts.length,
    sets: data.sets.length,
    feedback: data.feedback.length,
  };
}
