import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { userSettings } from "@/lib/db/schema";

/*
 * Per-user cache (ADR 0005, updated in 1b). Keys include `user_settings.data_version`,
 * which every import and every settings/log write bumps. Each request reads the version
 * from Postgres (one tiny query), so all serverless instances see invalidations at once,
 * while the expensive store load and engine run are reused within an instance.
 */

const MAX_ENTRIES = 200;

class Lru<V> {
  private map = new Map<string, V>();
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > MAX_ENTRIES) this.map.delete(this.map.keys().next().value as string);
  }
  deletePrefix(prefix: string): void {
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k);
  }
}

const globalForCache = globalThis as unknown as { __trainCache?: Lru<unknown> };
const cache = (globalForCache.__trainCache ??= new Lru<unknown>());

export async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await compute();
  cache.set(key, value);
  return value;
}

/** Invalidates every cached value for the user (here and, via the version, everywhere). */
export async function bumpDataVersion(userId: string, db: Db = getDb()): Promise<void> {
  await db
    .update(userSettings)
    .set({ dataVersion: sql`${userSettings.dataVersion} + 1` })
    .where(eq(userSettings.userId, userId));
  cache.deletePrefix(`${userId}:`);
}
