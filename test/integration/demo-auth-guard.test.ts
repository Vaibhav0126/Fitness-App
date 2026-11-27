import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_BLOCKED_PATHS } from "@/lib/auth/demo-guard";
import { getDb } from "@/lib/db/client";
import { session as sessionTable, user } from "@/lib/db/schema";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { regenerateDemo } from "@/server/seed/demo";

// Auth reads these lazily; CI sets them, local runs may not.
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.APP_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const { getAuth } = await import("@/lib/auth/server");
const db = getDb();
const BASE = process.env.BETTER_AUTH_URL;
const NORMAL_EMAIL = `guard-${randomUUID()}@example.test`;
const PASSWORD = "correct horse battery";

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

function call(path: string, cookie: string, body: unknown = {}) {
  return getAuth().handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE!, cookie },
      body: JSON.stringify(body),
    }),
  );
}

/** Plausible bodies, so a pass-through would reach the endpoint rather than fail validation first. */
const BODIES: Record<string, unknown> = {
  "/update-user": { name: "Hijacked" },
  "/change-email": { newEmail: `x-${randomUUID()}@example.test` },
  "/change-password": { currentPassword: "x", newPassword: "something-long-enough" },
  "/link-social": { provider: "github" },
  "/unlink-account": { providerId: "credential" },
  "/delete-user": {},
  "/revoke-session": { token: "nope" },
  "/revoke-sessions": {},
  "/revoke-other-sessions": {},
};

let demoCookie = "";
let normalCookie = "";
let normalId = "";

beforeAll(async () => {
  await regenerateDemo(db);
  const demo = await getAuth().api.demoSignIn({ headers: new Headers(), asResponse: true });
  expect(demo.ok).toBe(true);
  demoCookie = cookieOf(demo);

  const ctx = await getAuth().$context;
  const u = await ctx.internalAdapter.createUser(
    { email: NORMAL_EMAIL, name: "Guard Test", emailVerified: true },
    { method: "admin" },
  );
  normalId = u.id;
  await ctx.internalAdapter.linkAccount({
    userId: u.id,
    providerId: "credential",
    accountId: u.id,
    password: await ctx.password.hash(PASSWORD),
  });
  const res = await getAuth().api.signInEmail({
    body: { email: NORMAL_EMAIL, password: PASSWORD },
    asResponse: true,
  });
  expect(res.ok).toBe(true);
  normalCookie = cookieOf(res);
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, normalId));
  await db.delete(sessionTable).where(eq(sessionTable.userId, DEMO_USER_ID));
});

describe("demo account guard (Better Auth hooks.before)", () => {
  it("covers every account-changing endpoint", () => {
    expect([...DEMO_BLOCKED_PATHS].sort()).toEqual(Object.keys(BODIES).sort());
  });

  it.each([...DEMO_BLOCKED_PATHS])("rejects %s for the demo session with 403", async (path) => {
    const res = await call(path, demoCookie, BODIES[path]);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/read-only/);
  });

  it("leaves the demo user unchanged and still signed in", async () => {
    const [u] = await db.select().from(user).where(eq(user.id, DEMO_USER_ID));
    expect(u).toMatchObject({ name: "Demo Athlete", isDemo: true });
    const s = await getAuth().api.getSession({ headers: new Headers({ cookie: demoCookie }) });
    expect(s?.user.id).toBe(DEMO_USER_ID);
  });

  it("does not affect normal users", async () => {
    const res = await call("/update-user", normalCookie, { name: "Renamed" });
    expect(res.status).toBe(200);
    const [u] = await db.select().from(user).where(eq(user.id, normalId));
    expect(u?.name).toBe("Renamed");
  });

  it("does not block reads or sign-out for the demo user", async () => {
    const res = await getAuth().handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: demoCookie, origin: BASE! } }),
    );
    expect(res.status).toBe(200);
  });
});
