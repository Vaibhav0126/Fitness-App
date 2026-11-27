import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { user, userSettings } from "@/lib/db/schema";
import { defaultPlanConfig } from "@/lib/engine/config";

/** Creates throwaway users (cleaned up by `cleanup`). */
export function testUsers(db: Db, prefix: string) {
  const ids: string[] = [];
  return {
    ids,
    async create(opts: { emailVerified?: boolean; isDemo?: boolean; timeZone?: string } = {}) {
      const id = `${prefix}-${randomUUID()}`;
      const timeZone = opts.timeZone ?? "Asia/Tokyo";
      await db.insert(user).values({
        id,
        name: prefix,
        email: `${id}@example.test`,
        emailVerified: opts.emailVerified ?? true,
        isDemo: opts.isDemo ?? false,
      });
      await db.insert(userSettings).values({
        userId: id,
        timeZone,
        onboardingDone: true,
        config: defaultPlanConfig({ timeZone, planStart: "2026-11-02" }),
      });
      ids.push(id);
      return id;
    },
    async cleanup() {
      if (ids.length) await db.delete(user).where(inArray(user.id, ids));
    },
  };
}

export function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: text,
  });
}
