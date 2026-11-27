import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { importJob, strengthSet, user, userSettings, workout, workoutInterval } from "@/lib/db/schema";
import { defaultPlanConfig } from "@/lib/engine/config";
import type { SetRecord, WorkoutRecord } from "@/lib/importers/schemas";
import { csvToRecords } from "@/lib/parsers/csv";
import { parseHaeFile } from "@/lib/parsers/hae";
import { detectPreset, normalizeStrengthRows } from "@/lib/parsers/strength-csv";
import { applyBatch } from "@/server/importers/batch";
import { mergeMetrics, mergeSets, mergeWorkouts } from "@/server/importers/merge";
import { seedAliases } from "@/server/seed/aliases";

const db = getDb();
const U = `test-import-${randomUUID()}`;
const fixture = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../fixtures", f), "utf8");
const hae = (f: string) =>
  parseHaeFile(JSON.parse(fixture(f)), {
    timeZone: "Asia/Tokyo",
    runClassification: { walkSpeedKmh: 5.5, marginKmh: 1 },
  });

beforeAll(async () => {
  await seedAliases(db);
  await db
    .insert(user)
    .values({ id: U, name: "Import Test", email: `${U}@example.test`, emailVerified: true });
  await db.insert(userSettings).values({
    userId: U,
    timeZone: "Asia/Tokyo",
    config: defaultPlanConfig({ timeZone: "Asia/Tokyo", planStart: "2026-11-18" }),
  });
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, U));
});

describe("CSV import idempotency", () => {
  const { headers, records } = csvToRecords(fixture("hevy.csv"));
  const { sets } = normalizeStrengthRows(records, detectPreset(headers)!.mapping, "Asia/Tokyo");

  it("first import inserts, second import changes nothing", async () => {
    const first = await mergeSets(U, "csv_hevy", sets as SetRecord[]);
    expect(first).toMatchObject({ inserted: 11, updated: 0, unchanged: 0 });
    expect(first.sessions).toMatchObject({ inserted: 2 });
    const second = await mergeSets(U, "csv_hevy", sets as SetRecord[]);
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: 11 });
    expect(second.sessions).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    const rows = await db.select().from(strengthSet).where(eq(strengthSet.userId, U));
    expect(rows).toHaveLength(11);
  });

  it("canonicalizes exercise names through aliases and links sets to session workouts", async () => {
    const rows = await db.select().from(strengthSet).where(eq(strengthSet.userId, U));
    const legPress = rows.find((r) => r.exerciseRaw === "Leg Press");
    expect(legPress?.exercise).toBe("Leg Press (Machine)");
    expect(rows.every((r) => r.workoutId != null)).toBe(true);
    const sessions = await db.select().from(workout).where(eq(workout.userId, U));
    expect(sessions.find((w) => w.name === "Lower A")?.durationS).toBe(65 * 60);
  });

  it("a re-import with a null never overwrites a stored value", async () => {
    const withoutRpe = sets.map((s) => ({ ...s, rpe: null })) as SetRecord[];
    const r = await mergeSets(U, "csv_hevy", withoutRpe);
    expect(r).toMatchObject({ inserted: 0, updated: 0 });
    const [row] = await db.select().from(strengthSet).where(eq(strengthSet.externalId, sets[3]!.externalId));
    expect(row?.rpe).toBe(8.5);
  });

  it("a changed value updates the row", async () => {
    const changed = sets.map((s, i) => (i === 2 ? { ...s, reps: 9 } : s)) as SetRecord[];
    expect(await mergeSets(U, "csv_hevy", changed)).toMatchObject({ inserted: 0, updated: 1 });
  });
});

describe("HAE import idempotency and merge", () => {
  it("metrics: insert once, then unchanged", async () => {
    const { metrics } = hae("hae-metrics.json");
    const a = await mergeMetrics(U, "hae", metrics);
    expect(a.inserted).toBe(metrics.length);
    expect(await mergeMetrics(U, "hae", metrics)).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: metrics.length,
    });
  });

  it("workouts: a later export missing stepCount/HR keeps the earlier non-null fields", async () => {
    const first = hae("hae-workouts.json").workouts as WorkoutRecord[];
    const r1 = await mergeWorkouts(U, "hae", first);
    expect(r1).toMatchObject({ inserted: 2 });
    expect(r1.intervals.inserted).toBe(13);

    const later = hae("hae-workouts-later.json").workouts as WorkoutRecord[];
    const r2 = await mergeWorkouts(U, "hae", later);
    expect(r2).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 });
    expect(r2.intervals).toMatchObject({ inserted: 0, updated: 0, unchanged: 13 });

    const [run] = await db.select().from(workout).where(eq(workout.externalId, "6C1B2A90-RUNWALK-0001"));
    expect(run).toMatchObject({ avgHr: 134, maxHr: 152, avgCadence: 134 });
    const ivs = await db.select().from(workoutInterval).where(eq(workoutInterval.workoutId, run!.id));
    expect(ivs.find((i) => i.idx === 1)).toMatchObject({ kind: "run", cadence: 168 });
  });
});

describe("batch API service", () => {
  it("records an import job with summed counts across chunks", async () => {
    const { metrics } = hae("hae-metrics.json");
    const half = Math.ceil(metrics.length / 2);
    const a = await applyBatch(U, {
      kind: "metrics",
      source: "manual",
      fileName: "x.json",
      rows: metrics.slice(0, half),
    });
    await applyBatch(U, {
      kind: "metrics",
      source: "manual",
      jobId: a.jobId,
      final: true,
      rows: metrics.slice(half),
    });
    const [job] = await db.select().from(importJob).where(eq(importJob.id, a.jobId));
    expect(job).toMatchObject({ status: "done", kind: "Manual: x.json" });
    expect(job?.counts).toMatchObject({ metricsInserted: metrics.length });
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, U));
    expect(settings!.dataVersion).toBeGreaterThanOrEqual(2);
  });

  it("rejects another user's job id", async () => {
    const other = `test-other-${randomUUID()}`;
    await db
      .insert(user)
      .values({ id: other, name: "o", email: `${other}@example.test`, emailVerified: true });
    try {
      const jobs = await db
        .select()
        .from(importJob)
        .where(inArray(importJob.userId, [U]));
      await expect(
        applyBatch(other, { kind: "metrics", source: "manual", jobId: jobs[0]!.id, rows: [] }),
      ).rejects.toThrow(/unknown import job/);
    } finally {
      await db.delete(user).where(eq(user.id, other));
    }
  });
});
