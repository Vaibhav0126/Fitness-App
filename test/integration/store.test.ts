import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { dailyMetric, strengthSet, user, workout } from "@/lib/db/schema";
import { loadEngineStore, storeWindow } from "@/server/queries/store";

const db = getDb();
const U = `test-store-${randomUUID()}`;
const now = new Date("2026-11-27T00:00:00Z");
const set = (exercise: string, at: string, weightKg: number, setIndex = 0) => ({
  source: "manual",
  externalId: `${exercise}|${at}|${setIndex}`,
  performedAt: new Date(at),
  exercise,
  exerciseRaw: exercise,
  setIndex,
  weightKg,
  reps: 5,
});

beforeAll(async () => {
  await db.insert(user).values({ id: U, name: "s", email: `${U}@example.test`, emailVerified: true });
  const s = scoped(U);
  await s.insert(strengthSet, [
    set("Squat (Barbell)", "2024-06-01T07:00:00Z", 80), // old, but squat has recent sets → excluded
    set("Squat (Barbell)", "2026-11-20T07:00:00Z", 100),
    set("Deadlift (Barbell)", "2024-01-01T07:00:00Z", 120), // older session of an exercise with no recent sets
    set("Deadlift (Barbell)", "2024-05-01T07:00:00Z", 140), // its latest session → included
    set("Deadlift (Barbell)", "2024-05-01T07:00:00Z", 140, 1),
  ]);
  await s.insert(dailyMetric, [
    { date: "2025-01-01", name: "steps", value: 1, source: "manual" },
    { date: "2026-11-26", name: "steps", value: 2, source: "manual" },
  ]);
  await s.insert(workout, [
    { source: "manual", externalId: "old", type: "run", start: new Date("2025-06-01T06:00:00Z") },
    { source: "manual", externalId: "new", type: "run", start: new Date("2026-11-25T06:00:00Z") },
  ]);
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, U));
});

describe("loadEngineStore window", () => {
  it("loads the last 365 days plus each stale exercise's latest session", async () => {
    const store = await loadEngineStore(U, db, storeWindow(now));
    expect(store.metrics.map((m) => m.value)).toEqual([2]);
    expect(store.workouts.map((w) => w.start)).toEqual(["2026-11-25T06:00:00.000Z"]);
    const squat = store.sets.filter((x) => x.exercise === "Squat (Barbell)").map((x) => x.weightKg);
    const dead = store.sets.filter((x) => x.exercise === "Deadlift (Barbell)").map((x) => x.weightKg);
    expect(squat).toEqual([100]);
    expect(dead).toEqual([140, 140]);
  });

  it("extends back to planStart for run-plan progress", async () => {
    const store = await loadEngineStore(U, db, storeWindow(now, "2025-05-01"));
    expect(store.workouts).toHaveLength(2);
  });
});
