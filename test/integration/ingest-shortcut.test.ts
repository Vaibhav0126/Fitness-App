import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/shortcut/route";
import { getDb } from "@/lib/db/client";
import { dailyMetric, ingestRateLimit, userSettings } from "@/lib/db/schema";
import { localDate } from "@/lib/engine/dates";
import { AUTH_FAIL_LIMIT } from "@/server/ingest/http";
import { SHORTCUT_LIMITS } from "@/server/ingest/limits";
import { createToken, revokeToken } from "@/server/tokens";
import { post, testUsers } from "./helpers";

const db = getDb();
const users = testUsers(db, "test-shortcut");
const URL_ = "http://localhost:3000/api/ingest/shortcut";
const today = localDate(new Date(), "Asia/Tokyo");
const payload = (date = today) => ({
  v: 1,
  tz: "Asia/Tokyo",
  days: [{ date, sleepHours: 7.2, hrvSdnnMs: 48, restingHr: 56, steps: 10432, activeEnergyKcal: 640 }],
});
const call = (token: string | null, body: unknown = payload(), headers: Record<string, string> = {}) =>
  POST(post(URL_, body, { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }));

beforeEach(async () => {
  await db.delete(ingestRateLimit);
});
afterAll(() => users.cleanup());

describe("POST /api/ingest/shortcut", () => {
  it("requires a valid, active token", async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call("trn_not-a-real-token")).status).toBe(401);
    const u = await users.create();
    const { id, token } = await createToken(u, "phone");
    await revokeToken(u, id);
    const res = await call(token);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("refuses the demo user and unverified users", async () => {
    const demo = await users.create({ isDemo: true });
    const { token } = await createToken(demo, "demo");
    const res = await call(token);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/read-only/) });
    const unverified = await users.create({ emailVerified: false });
    expect((await call((await createToken(unverified, "x")).token)).status).toBe(403);
    expect(await db.select().from(dailyMetric).where(eq(dailyMetric.userId, demo))).toEqual([]);
  });

  it("stores the metrics under source 'shortcut' and is idempotent", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "phone");
    const versionBefore = (await db.select().from(userSettings).where(eq(userSettings.userId, u)))[0]!
      .dataVersion;
    const first = await call(token);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, received: 5, counts: { metricsInserted: 5 } });
    const second = await call(token);
    expect(await second.json()).toMatchObject({ counts: { metricsUnchanged: 5 } });
    const rows = await db
      .select()
      .from(dailyMetric)
      .where(and(eq(dailyMetric.userId, u), eq(dailyMetric.date, today)));
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.source === "shortcut")).toBe(true);
    const versionAfter = (await db.select().from(userSettings).where(eq(userSettings.userId, u)))[0]!
      .dataVersion;
    expect(versionAfter).toBe(versionBefore + 1); // bumped by the insert, not by the no-op resend
  });

  it("updates a day when values change", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "phone");
    await call(token);
    const changed = payload();
    changed.days[0]!.steps = 12000;
    expect(await (await call(token, changed)).json()).toMatchObject({
      counts: { metricsUpdated: 1, metricsUnchanged: 4 },
    });
  });

  it("answers 200 with a warning when there are no values (locked phone)", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "phone");
    const res = await call(token, { v: 1, days: [{ date: today, sleepHours: "", hrvSdnnMs: 0 }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: 0, warning: expect.stringMatching(/locked/) });
  });

  it("rejects bad payloads, more than 14 days and bodies over the size limit", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "phone");
    expect((await call(token, "{not json")).status).toBe(400);
    expect(
      (await call(token, { v: 1, days: Array.from({ length: 15 }, () => ({ date: today })) })).status,
    ).toBe(400);
    const big = JSON.stringify({ v: 1, days: [{ date: today, note: "x".repeat(SHORTCUT_LIMITS.maxBytes) }] });
    expect((await call(token, big)).status).toBe(413);
    // Without a Content-Length header the cap is enforced while streaming.
    const streamed = new Request(URL_, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: new Blob([big]).stream(),
      duplex: "half",
    } as RequestInit);
    expect((await POST(streamed)).status).toBe(413);
  });

  it(`rate-limits each token (${SHORTCUT_LIMITS.perToken.limit}/hour)`, async () => {
    const u = await users.create();
    const { id, token } = await createToken(u, "phone");
    const ok = await call(token);
    expect(ok.headers.get("x-ratelimit-remaining")).toBe(String(SHORTCUT_LIMITS.perToken.limit - 1));
    await db
      .update(ingestRateLimit)
      .set({ count: SHORTCUT_LIMITS.perToken.limit })
      .where(eq(ingestRateLimit.key, `shortcut:token:${id}`));
    const limited = await call(token);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another token of the same user has its own budget.
    expect((await call((await createToken(u, "other")).token)).status).toBe(200);
    // An expired window starts over.
    await db
      .update(ingestRateLimit)
      .set({ windowStart: new Date(Date.now() - 2 * 3600_000) })
      .where(eq(ingestRateLimit.key, `shortcut:token:${id}`));
    expect((await call(token)).status).toBe(200);
  });

  it("rate-limits failed authentication per IP", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < AUTH_FAIL_LIMIT.limit; i++)
      expect((await call("trn_wrong", payload(), ip)).status).toBe(401);
    expect((await call("trn_wrong", payload(), ip)).status).toBe(429);
    expect((await call("trn_wrong", payload(), { "x-forwarded-for": "203.0.113.8" })).status).toBe(401);
  });
});
