import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { connection, ingestRateLimit, strengthSet, user } from "@/lib/db/schema";
import { type HevyApi, hevyUserInfoSchema, hevyWorkoutsPageSchema } from "@/lib/integrations/hevy/client";
import { runDaily } from "@/server/cron/daily";
import { saveHevyKey } from "@/server/integrations/hevy";
import { testUsers } from "./helpers";

process.env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const db = getDb();
const users = testUsers(db, "test-cron");
const fx = (f: string) =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../fixtures/hevy", f), "utf8"));
const api: HevyApi = {
  userInfo: async () => hevyUserInfoSchema.parse(fx("user-info.json")).data,
  workouts: async (p) => hevyWorkoutsPageSchema.parse(fx(`workouts-page-${p}.json`)),
  events: async () => ({ page: 1, page_count: 0, events: [] }),
};
const factory = () => api;

afterAll(() => users.cleanup());
afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
});

describe("GET /api/cron/daily", () => {
  const call = async (auth?: string) => {
    const { GET } = await import("@/app/api/cron/daily/route");
    return GET(
      new Request("http://localhost:3000/api/cron/daily", { headers: auth ? { authorization: auth } : {} }),
    );
  };

  it("is disabled without CRON_SECRET and rejects a wrong secret", async () => {
    expect((await call("Bearer anything")).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-of-same-length-01")).status).toBe(401);
    expect((await call("cron-secret-for-tests-0123456789")).status).toBe(401);
  });

  it("runs with the right secret", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
    const daily = await import("@/server/cron/daily");
    const spy = vi
      .spyOn(daily, "runDaily")
      .mockResolvedValue({ demo: "regenerated", hevy: [], skipped: 0, rateLimitRowsPurged: 0 });
    const res = await call("Bearer cron-secret-for-tests-0123456789");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ demo: "regenerated", hevySynced: 0 });
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("runDaily", () => {
  it("syncs connected, verified users, skips rejected keys, and purges old rate-limit rows", async () => {
    const ok = await users.create();
    const rejected = await users.create();
    const unverified = await users.create({ emailVerified: false });
    for (const u of [ok, rejected, unverified])
      await saveHevyKey(u, "hevy-test-key-0000-1111-2222", db, factory);
    await db.update(connection).set({ status: "invalid_key" }).where(eq(connection.userId, rejected));
    await db
      .insert(ingestRateLimit)
      .values({ key: "old:key", windowStart: new Date("2026-01-01T00:00:00Z"), count: 3 });

    const r = await runDaily({ db, factory, pauseMs: 0 });
    expect(r.demo).toBe("regenerated");
    const synced = r.hevy.map((h) => h.userId);
    expect(synced).toContain(ok);
    expect(synced).not.toContain(rejected);
    expect(synced).not.toContain(unverified);
    expect(await db.select().from(strengthSet).where(eq(strengthSet.userId, ok))).toHaveLength(11);
    expect(r.rateLimitRowsPurged).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(ingestRateLimit).where(eq(ingestRateLimit.key, "old:key"))).toEqual([]);
    // Demo user never gets a Hevy sync.
    expect(synced).not.toContain((await db.select().from(user).where(eq(user.isDemo, true)))[0]?.id);
  });
});
