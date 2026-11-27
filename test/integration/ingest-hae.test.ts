import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/hae/route";
import { getDb } from "@/lib/db/client";
import { dailyMetric, ingestRateLimit, workout, workoutInterval } from "@/lib/db/schema";
import type { MetricRecord } from "@/lib/importers/schemas";
import { parseHaeFile } from "@/lib/parsers/hae";
import { applyBatch } from "@/server/importers/batch";
import { HAE_LIMITS } from "@/server/ingest/limits";
import { createToken } from "@/server/tokens";
import { post, testUsers } from "./helpers";

const db = getDb();
const users = testUsers(db, "test-hae-push");
const URL_ = "http://localhost:3000/api/ingest/hae";
const fixture = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../fixtures", f), "utf8");
const call = (token: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(post(URL_, body, { authorization: `Bearer ${token}`, ...headers }));

beforeEach(async () => {
  await db.delete(ingestRateLimit);
});
afterAll(() => users.cleanup());

describe("POST /api/ingest/hae", () => {
  it("imports workouts with intervals and is idempotent", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "hae");
    const body = fixture("hae-workouts-real-8x90.json");
    const first = await call(token, body);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      counts: { workoutsInserted: 1, intervalsInserted: 17 },
    });
    const second = await (await call(token, body)).json();
    expect(second.counts).toMatchObject({ workoutsUnchanged: 1, intervalsUnchanged: 17 });
    const [w] = await db.select().from(workout).where(eq(workout.userId, u));
    expect(w).toMatchObject({ source: "hae", type: "run", externalId: "REAL-SHAPE-8X90-0001" });
    const ivs = await db.select().from(workoutInterval).where(eq(workoutInterval.workoutId, w!.id));
    expect(ivs.filter((i) => i.kind === "run")).toHaveLength(8);
    expect(ivs.every((i) => i.avgHr == null || Number.isInteger(i.avgHr))).toBe(true);
  });

  it("merges with a browser file upload of the same export (same source and keys)", async () => {
    const u = await users.create();
    const { token } = await createToken(u, "hae");
    const parsed = parseHaeFile(JSON.parse(fixture("hae-metrics.json")), {
      timeZone: "Asia/Tokyo",
      runClassification: { walkSpeedKmh: 5.5, marginKmh: 1 },
    });
    await applyBatch(u, {
      kind: "metrics",
      source: "hae",
      rows: parsed.metrics as MetricRecord[],
      final: true,
    });
    const pushed = await (await call(token, fixture("hae-metrics.json"))).json();
    expect(pushed.counts.metricsInserted ?? 0).toBe(0);
    expect(pushed.counts.metricsUnchanged).toBe(parsed.metrics.length);
    const rows = await db
      .select()
      .from(dailyMetric)
      .where(and(eq(dailyMetric.userId, u), eq(dailyMetric.source, "hae")));
    expect(rows).toHaveLength(parsed.metrics.length);
  });

  it("refuses the demo user, bad JSON, non-HAE JSON and oversized bodies", async () => {
    const demo = await users.create({ isDemo: true });
    expect((await call((await createToken(demo, "d")).token, fixture("hae-metrics.json"))).status).toBe(403);
    const u = await users.create();
    const { token } = await createToken(u, "hae");
    expect((await call(token, "{")).status).toBe(400);
    expect((await call(token, { hello: "world" })).status).toBe(400);
    const tooBig = await call(token, "{}", { "content-length": String(HAE_LIMITS.maxBytes + 1) });
    expect(tooBig.status).toBe(413);
  });

  it(`rate-limits each token (${HAE_LIMITS.perToken.limit}/hour)`, async () => {
    const u = await users.create();
    const { id, token } = await createToken(u, "hae");
    await db
      .insert(ingestRateLimit)
      .values({ key: `hae:token:${id}`, windowStart: new Date(), count: HAE_LIMITS.perToken.limit });
    expect((await call(token, fixture("hae-metrics.json"))).status).toBe(429);
  });
});
