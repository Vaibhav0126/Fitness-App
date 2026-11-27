import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { connection, ingestRateLimit, session as sessionTable, uploadToken, user } from "@/lib/db/schema";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { regenerateDemo } from "@/server/seed/demo";

/*
 * Session-authenticated endpoints (Hevy key/sync routes and the Settings server actions),
 * called with real Better Auth cookies. next/headers and next/cache are stubbed because
 * there is no Next.js request scope in tests.
 */

let currentCookie = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: currentCookie }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.APP_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const { getAuth } = await import("@/lib/auth/server");
const keyRoute = await import("@/app/api/hevy/key/route");
const syncRoute = await import("@/app/api/hevy/sync/route");
const actions = await import("@/server/actions/connections");

const db = getDb();
const EMAIL = `routes-${randomUUID()}@example.test`;
const PASSWORD = "correct horse battery";
let demoCookie = "";
let normalCookie = "";
let normalId = "";

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const as = (cookie: string) => {
  currentCookie = cookie;
};
const jsonReq = (body: unknown) =>
  new Request("http://localhost:3000/api/hevy/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const exhaust = (key: string, count: number) =>
  db
    .insert(ingestRateLimit)
    .values({ key, windowStart: new Date(), count })
    .onConflictDoUpdate({ target: ingestRateLimit.key, set: { count, windowStart: new Date() } });
const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  await regenerateDemo(db);
  demoCookie = cookieOf(await getAuth().api.demoSignIn({ headers: new Headers(), asResponse: true }));
  const ctx = await getAuth().$context;
  const u = await ctx.internalAdapter.createUser(
    { email: EMAIL, name: "Routes Test", emailVerified: true },
    { method: "admin" },
  );
  normalId = u.id;
  await ctx.internalAdapter.linkAccount({
    userId: u.id,
    providerId: "credential",
    accountId: u.id,
    password: await ctx.password.hash(PASSWORD),
  });
  normalCookie = cookieOf(
    await getAuth().api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true }),
  );
});
beforeEach(async () => {
  await db.delete(ingestRateLimit);
});
afterAll(async () => {
  await db.delete(user).where(eq(user.id, normalId));
  await db.delete(sessionTable).where(eq(sessionTable.userId, DEMO_USER_ID));
});

describe("Hevy routes", () => {
  it("require a session", async () => {
    as("");
    expect((await keyRoute.POST(jsonReq({ apiKey: "x" }))).status).toBe(401);
    expect((await keyRoute.DELETE()).status).toBe(401);
    expect((await syncRoute.POST()).status).toBe(401);
  });

  it("are blocked for the demo user", async () => {
    as(demoCookie);
    for (const res of [
      await keyRoute.POST(jsonReq({ apiKey: "k".repeat(30) })),
      await keyRoute.DELETE(),
      await syncRoute.POST(),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/read-only/) });
    }
    expect(await db.select().from(connection).where(eq(connection.userId, DEMO_USER_ID))).toEqual([]);
  });

  it("validate the body, report a missing connection, and rate-limit", async () => {
    as(normalCookie);
    expect((await keyRoute.POST(jsonReq({ nope: 1 }))).status).toBe(400);
    expect((await syncRoute.POST()).status).toBe(409);
    await exhaust(`hevy-sync:user:${normalId}`, 12);
    expect((await syncRoute.POST()).status).toBe(429);
    await exhaust(`hevy-key:user:${normalId}`, 10);
    expect((await keyRoute.POST(jsonReq({ apiKey: "k".repeat(30) }))).status).toBe(429);
  });
});

describe("Connections server actions", () => {
  it("create and revoke tokens for a normal user (token shown once)", async () => {
    as(normalCookie);
    const created = await actions.createUploadToken(null, form({ name: "iPhone" }));
    expect(created.ok).toBe(true);
    const token = created.ok ? created.data!.token : "";
    expect(token).toMatch(/^trn_/);
    const [row] = await db.select().from(uploadToken).where(eq(uploadToken.userId, normalId));
    expect(row!.tokenHash).not.toBe(token);
    expect(await actions.revokeUploadToken(row!.id)).toMatchObject({ ok: true });
    expect(await actions.revokeUploadToken(row!.id)).toMatchObject({ ok: false });
    expect(await actions.revokeUploadToken("not-a-uuid")).toMatchObject({ ok: false });
  });

  it("are blocked for the demo user", async () => {
    as(demoCookie);
    for (const r of [
      await actions.createUploadToken(null, form({ name: "x" })),
      await actions.revokeUploadToken(randomUUID()),
      await actions.connectHevy(null, form({ apiKey: "k".repeat(30) })),
      await actions.syncHevyNow(),
      await actions.disconnectHevyAction(),
    ]) {
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/read-only/) });
    }
    expect(await db.select().from(uploadToken).where(eq(uploadToken.userId, DEMO_USER_ID))).toEqual([]);
  });
});
