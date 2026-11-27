import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __trainPool?: Pool; __trainDb?: Db };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 5_000 });
  // On Vercel Fluid compute, release idle connections before the instance is suspended.
  // See https://neon.com/docs/guides/vercel-connection-methods
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

/** Shared pool + Drizzle instance, created on first use (safe across dev hot reloads). */
export function getDb(): Db {
  if (!globalForDb.__trainDb) {
    globalForDb.__trainPool ??= createPool();
    globalForDb.__trainDb = drizzle(globalForDb.__trainPool, { schema, casing: "snake_case" });
  }
  return globalForDb.__trainDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__trainPool?.end();
  globalForDb.__trainPool = undefined;
  globalForDb.__trainDb = undefined;
}
