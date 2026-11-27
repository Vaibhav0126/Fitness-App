import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import {
  connection,
  dailyMetric,
  exerciseAlias,
  importJob,
  runFeedback,
  strengthSet,
  user,
  userSettings,
  workout,
  workoutInterval,
} from "@/lib/db/schema";
import { getSession } from "@/server/dal";

/** GET /api/export: everything stored for the signed-in user, as one JSON file. Secrets are excluded. */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  const id = session.user.id;
  const db = getDb();
  const s = scoped(id, db);
  const [profile] = await db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, id));
  const workouts = await db.select().from(workout).where(s.owns(workout)).orderBy(asc(workout.start));
  const intervals = workouts.length
    ? await db
        .select()
        .from(workoutInterval)
        .where(
          inArray(
            workoutInterval.workoutId,
            workouts.map((w) => w.id),
          ),
        )
    : [];
  const ivBy = Map.groupBy(intervals, (iv) => iv.workoutId);
  const body = {
    exportedAt: new Date().toISOString(),
    format: "train-export/1",
    profile,
    settings: (await s.select(userSettings))[0] ?? null,
    connections: await db
      .select({
        provider: connection.provider,
        status: connection.status,
        credentialLastFour: connection.credentialLastFour,
        createdAt: connection.createdAt,
      })
      .from(connection)
      .where(s.owns(connection)),
    dailyMetrics: await db
      .select()
      .from(dailyMetric)
      .where(s.owns(dailyMetric))
      .orderBy(asc(dailyMetric.date)),
    workouts: workouts.map((w) => ({
      ...w,
      intervals: (ivBy.get(w.id) ?? []).sort((a, b) => a.idx - b.idx),
    })),
    strengthSets: await db
      .select()
      .from(strengthSet)
      .where(s.owns(strengthSet))
      .orderBy(asc(strengthSet.performedAt), asc(strengthSet.exercise), asc(strengthSet.setIndex)),
    runFeedback: await s.select(runFeedback),
    exerciseAliases: await s.select(exerciseAlias),
    importJobs: await s.select(importJob),
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="train-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
