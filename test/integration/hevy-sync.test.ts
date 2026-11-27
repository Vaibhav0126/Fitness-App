import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import { connection, importJob, ingestRateLimit, strengthSet, workout } from "@/lib/db/schema";
import {
  type HevyApi,
  HevyApiError,
  hevyEventsPageSchema,
  hevyUserInfoSchema,
  hevyWorkoutsPageSchema,
} from "@/lib/integrations/hevy/client";
import {
  type ApiFactory,
  getHevyConnection,
  HevyKeyError,
  saveHevyKey,
  syncHevy,
} from "@/server/integrations/hevy";
import { loadEngineStore } from "@/server/queries/store";
import { mergeSets } from "@/server/importers/merge";
import { seedAliases } from "@/server/seed/aliases";
import { testUsers } from "./helpers";

process.env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const db = getDb();
const users = testUsers(db, "test-hevy");
const fx = (f: string) =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../fixtures/hevy", f), "utf8"));
const KEY = "hevy-test-key-0000-1111-2222";
const A = "00000000-0000-4000-8000-00000000000a";
const C = "00000000-0000-4000-8000-00000000000c";

/** Recorded-fixture HevyApi. `events` returns the edit/delete page only when `withEvents` is on. */
function fakeHevy(opts: { withEvents?: boolean; fail?: HevyApiError } = {}) {
  const calls: string[] = [];
  const api: HevyApi = {
    async userInfo() {
      calls.push("userInfo");
      if (opts.fail) throw opts.fail;
      return hevyUserInfoSchema.parse(fx("user-info.json")).data;
    },
    async workouts(page) {
      calls.push(`workouts:${page}`);
      if (opts.fail) throw opts.fail;
      return hevyWorkoutsPageSchema.parse(fx(`workouts-page-${page}.json`));
    },
    async events(since, page) {
      calls.push(`events:${since}:${page}`);
      if (opts.fail) throw opts.fail;
      return opts.withEvents
        ? hevyEventsPageSchema.parse(fx("events-page-1.json"))
        : { page: 1, page_count: 0, events: [] };
    },
  };
  return { factory: () => api, calls };
}

const setsOf = (u: string) => db.select().from(strengthSet).where(eq(strengthSet.userId, u));

beforeEach(async () => {
  await db.delete(ingestRateLimit);
});
afterAll(() => users.cleanup());

describe("Hevy key", () => {
  it("is validated with one request, stored encrypted, and only the last 4 are exposed", async () => {
    const u = await users.create();
    const { factory, calls } = fakeHevy();
    expect(await saveHevyKey(u, `  ${KEY} `, db, factory)).toEqual({
      lastFour: "2222",
      username: "synthetic_lifter",
    });
    expect(calls).toEqual(["userInfo"]);
    const [c] = await db.select().from(connection).where(eq(connection.userId, u));
    expect(c!.apiKeyEnc).not.toContain(KEY);
    expect(decrypt(c!.apiKeyEnc!)).toBe(KEY);
    expect(c).toMatchObject({ provider: "hevy", credentialLastFour: "2222", status: "active" });
    const view = await getHevyConnection(u, db);
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect(view).toMatchObject({ connected: true, lastFour: "2222" });
  });

  it("rejects keys Hevy refuses and malformed keys, storing nothing", async () => {
    const u = await users.create();
    const { factory } = fakeHevy({ fail: new HevyApiError(401, "nope") });
    await expect(saveHevyKey(u, KEY, db, factory)).rejects.toBeInstanceOf(HevyKeyError);
    await expect(saveHevyKey(u, "short", db, fakeHevy().factory)).rejects.toBeInstanceOf(HevyKeyError);
    expect(await db.select().from(connection).where(eq(connection.userId, u))).toEqual([]);
  });
});

describe("Hevy sync", () => {
  it("full sync pages through /v1/workouts, then switches to events", async () => {
    await seedAliases(db);
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    const { factory, calls } = fakeHevy();
    const r = await syncHevy(u, { db, factory });
    expect(r).toMatchObject({ status: "done", upserted: 3, sets: { inserted: 11 } });
    expect(calls.slice(0, 2)).toEqual(["workouts:1", "workouts:2"]);
    expect(calls[2]).toMatch(/^events:/);
    const sets = await setsOf(u);
    expect(sets).toHaveLength(11); // A 5 + B 4 + C 2; the cardio set without reps is skipped
    expect(new Set(sets.map((s) => s.source))).toEqual(new Set(["hevy"]));
    const sessions = await db
      .select()
      .from(workout)
      .where(and(eq(workout.userId, u), eq(workout.type, "strength")));
    expect(sessions).toHaveLength(3);
    const [c] = await db.select().from(connection).where(eq(connection.userId, u));
    expect(JSON.parse(c!.syncCursor!)).toMatchObject({ mode: "events" });
    expect(c!.lastSyncAt).not.toBeNull();
    const [job] = await db.select().from(importJob).where(eq(importJob.userId, u));
    expect(job).toMatchObject({ kind: "Hevy sync (full)", status: "done" });
  });

  it("is idempotent: syncing the same data again changes nothing", async () => {
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    await syncHevy(u, { db, factory: fakeHevy().factory });
    // Force a second full pass over the same workouts.
    await db.update(connection).set({ syncCursor: null }).where(eq(connection.userId, u));
    const again = await syncHevy(u, { db, factory: fakeHevy().factory });
    expect(again.sets).toEqual({ inserted: 0, updated: 0, unchanged: 11, removed: 0 });
    expect(await setsOf(u)).toHaveLength(11);
  });

  it("applies update and delete events incrementally", async () => {
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    await syncHevy(u, { db, factory: fakeHevy().factory });
    const { factory, calls } = fakeHevy({ withEvents: true });
    const r = await syncHevy(u, { db, factory });
    expect(calls.every((c) => c.startsWith("events:"))).toBe(true);
    expect(r).toMatchObject({ status: "done", upserted: 1, deleted: 1 });
    const sets = await setsOf(u);
    // A: bench had 3 sets, now 2 (one removed); C (2 sets) deleted → 11 - 1 - 2 = 8.
    expect(sets).toHaveLength(8);
    expect(sets.some((s) => s.externalId.startsWith(C))).toBe(false);
    const bench = sets.find((s) => s.externalId === `${A}|0|1`)!;
    expect(bench).toMatchObject({ weightKg: 82.5, rpe: null }); // API values overwrite, nulls included
    expect(sets.some((s) => s.externalId === `${A}|0|2`)).toBe(false);
    const sessions = await db
      .select()
      .from(workout)
      .where(and(eq(workout.userId, u), eq(workout.type, "strength")));
    expect(sessions).toHaveLength(2); // C's session went with its sets
    // Re-applying the same events is a no-op.
    const again = await syncHevy(u, { db, factory: fakeHevy({ withEvents: true }).factory });
    expect(again.sets).toMatchObject({ inserted: 0, updated: 0, removed: 0 });
  });

  it("resumes a full sync that ran out of time", async () => {
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    // A deadline in the past processes nothing and keeps page 1.
    expect((await syncHevy(u, { db, factory: fakeHevy().factory, deadline: 0 })).status).toBe("partial");
    expect((await getHevyConnection(u, db)).syncing).toBe(true);
    // Allow exactly one page: the (mocked) clock passes the deadline during the first request.
    const { factory, calls } = fakeHevy();
    const base = factory();
    let clock = Date.now();
    const onePage: ApiFactory = () => ({
      ...base,
      workouts: async (p) => {
        const r = await base.workouts(p);
        clock += 120_000;
        return r;
      },
    });
    const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      expect((await syncHevy(u, { db, factory: onePage, deadline: clock + 60_000 })).status).toBe("partial");
    } finally {
      spy.mockRestore();
    }
    expect(calls).toEqual(["workouts:1"]);
    const [c] = await db.select().from(connection).where(eq(connection.userId, u));
    expect(JSON.parse(c!.syncCursor!)).toMatchObject({ mode: "full", page: 2 });
    const done = await syncHevy(u, { db, factory: fakeHevy().factory });
    expect(done.status).toBe("done");
    expect(await setsOf(u)).toHaveLength(11);
  });

  it("records a rejected key on the connection without throwing", async () => {
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    const r = await syncHevy(u, {
      db,
      factory: fakeHevy({ fail: new HevyApiError(401, "Hevy rejected the API key") }).factory,
    });
    expect(r.status).toBe("error");
    expect(await getHevyConnection(u, db)).toMatchObject({
      status: "invalid_key",
      lastError: "Hevy rejected the API key",
    });
  });

  it("counts a session once when it was also imported from a Hevy CSV", async () => {
    const u = await users.create();
    await saveHevyKey(u, KEY, db, fakeHevy().factory);
    await syncHevy(u, { db, factory: fakeHevy().factory });
    // The same Upper A session from a CSV export (minute precision, CSV naming).
    await mergeSets(u, "csv_hevy", [
      {
        kind: "set",
        externalId: "2026-11-23T21:05:00.000Z|Bench Press (Barbell)|1",
        performedAt: "2026-11-23T21:05:00.000Z",
        exerciseRaw: "Bench Press (Barbell)",
        setIndex: 1,
        weightKg: 80,
        reps: 8,
      },
    ]);
    const store = await loadEngineStore(u, db, {
      since: new Date("2026-01-01T00:00:00Z"),
      sinceDate: "2026-01-01",
    });
    expect(store.sets).toHaveLength(11);
    expect(store.workouts.filter((w) => w.type === "strength")).toHaveLength(3);
  });

  it("does nothing for users without a connection", async () => {
    const u = await users.create();
    expect((await syncHevy(u, { db, factory: fakeHevy().factory })).status).toBe("not_connected");
  });
});
