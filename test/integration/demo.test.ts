import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { strengthSet, user, userSettings } from "@/lib/db/schema";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { getSettings } from "@/server/queries/settings";
import { loadEngineStore } from "@/server/queries/store";
import { regenerateDemo } from "@/server/seed/demo";
import { seedAliases } from "@/server/seed/aliases";
import { computeState } from "@/lib/engine";

const db = getDb();

describe("demo seed", () => {
  it("creates a read-only, verified demo user with data, and re-running replaces (not duplicates) it", async () => {
    await seedAliases(db);
    const a = await regenerateDemo(db, new Date("2026-11-27T10:00:00Z"));
    const b = await regenerateDemo(db, new Date("2026-11-27T10:00:00Z"));
    expect(b).toEqual(a);
    const [u] = await db.select().from(user).where(eq(user.id, DEMO_USER_ID));
    expect(u).toMatchObject({ isDemo: true, emailVerified: true });
    const sets = await db.select().from(strengthSet).where(eq(strengthSet.userId, DEMO_USER_ID));
    expect(sets).toHaveLength(a.sets);
    expect(sets.every((s) => s.workoutId != null)).toBe(true);
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, DEMO_USER_ID));
    expect(settings?.onboardingDone).toBe(true);
    const state = computeState(
      await loadEngineStore(DEMO_USER_ID, db),
      (await getSettings(DEMO_USER_ID, db)).config,
      new Date("2026-11-27T10:00:00Z"),
    );
    expect(state.runs.some((r) => r.feedback?.shinPain != null)).toBe(true);
    expect(state.weekly.some((w) => Object.keys(w.groups).includes("quads"))).toBe(true);
  });
});
