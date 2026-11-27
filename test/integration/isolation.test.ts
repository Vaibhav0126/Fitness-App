import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { dailyMetric, runFeedback, strengthSet, user, workout, workoutInterval } from "@/lib/db/schema";
import { loadEngineStore } from "@/server/queries/store";

const db = getDb();
const A = `test-a-${randomUUID()}`;
const B = `test-b-${randomUUID()}`;

async function seedUser(id: string, marker: number) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.test`, emailVerified: true });
  const s = scoped(id);
  await s.insert(dailyMetric, [{ date: "2026-11-20", name: "hrv_sdnn_ms", value: marker, source: "manual" }]);
  const [w] = await s
    .insert(workout, [
      { source: "manual", externalId: `run-${marker}`, type: "run", start: new Date("2026-11-20T06:00:00Z") },
    ])
    .returning({ id: workout.id });
  await db.insert(workoutInterval).values({ workoutId: w!.id, idx: 0, kind: "run", avgSpeedKmh: marker });
  await s.insert(strengthSet, [
    {
      source: "manual",
      externalId: `set-${marker}`,
      performedAt: new Date("2026-11-20T07:00:00Z"),
      exercise: "Squat (Barbell)",
      exerciseRaw: "Squat (Barbell)",
      setIndex: 0,
      weightKg: marker,
      reps: 5,
    },
  ]);
  await s.insert(runFeedback, [{ date: "2026-11-20", shinPain: 1, workoutId: w!.id }]);
}

beforeAll(async () => {
  await seedUser(A, 11);
  await seedUser(B, 22);
});

afterAll(async () => {
  await db.delete(user).where(inArray(user.id, [A, B]));
});

describe("user isolation", () => {
  it("user A cannot read user B's rows", async () => {
    const rows = await scoped(A).select(dailyMetric);
    expect(rows.map((r) => r.value)).toEqual([11]);
    const store = await loadEngineStore(A);
    expect(store.metrics.map((m) => m.value)).toEqual([11]);
    expect(store.workouts).toHaveLength(1);
    expect(store.workouts[0]?.intervals.map((i) => i.avgSpeedKmh)).toEqual([11]);
    expect(store.sets.map((x) => x.weightKg)).toEqual([11]);
    expect(store.feedback).toHaveLength(1);
  });

  it("user A cannot update or delete user B's rows", async () => {
    const [bWorkout] = await db.select().from(workout).where(eq(workout.userId, B));
    const upd = await scoped(A)
      .update(workout, { name: "hijacked" }, eq(workout.id, bWorkout!.id))
      .returning();
    expect(upd).toHaveLength(0);
    const del = await scoped(A).delete(workout, eq(workout.id, bWorkout!.id)).returning();
    expect(del).toHaveLength(0);
    const [still] = await db.select().from(workout).where(eq(workout.id, bWorkout!.id));
    expect(still?.name).toBeNull();
  });

  it("insert forces the owner and update cannot change it", async () => {
    const s = scoped(A);
    await s.insert(dailyMetric, [
      { userId: B, date: "2026-11-21", name: "steps", value: 1, source: "manual" } as never,
    ]);
    const [row] = await db.select().from(dailyMetric).where(eq(dailyMetric.name, "steps"));
    expect(row?.userId).toBe(A);
    await s.update(dailyMetric, { userId: B, value: 2 } as never, eq(dailyMetric.name, "steps"));
    const [after] = await db.select().from(dailyMetric).where(eq(dailyMetric.name, "steps"));
    expect(after).toMatchObject({ userId: A, value: 2 });
  });

  it("deleting a user cascades to all their data", async () => {
    const C = `test-c-${randomUUID()}`;
    await seedUser(C, 33);
    await db.delete(user).where(eq(user.id, C));
    const left = await db.select().from(strengthSet).where(eq(strengthSet.userId, C));
    expect(left).toHaveLength(0);
  });
});
