import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { connection, ingestRateLimit, user } from "@/lib/db/schema";
import { type ApiFactory, HEVY, syncHevy } from "../integrations/hevy";
import { regenerateDemo } from "../seed/demo";

/*
 * Daily cron (spec §8). Order: demo refresh (cheap, keeps /demo current), then Hevy
 * syncs, least-recently-synced first, until the time budget runs out. A run that
 * doesn't reach everyone is fine: the next run starts with whoever was skipped, and a
 * user's long first sync resumes from its saved cursor (resumable, batched).
 * Hevy's limit is 1,000 requests / 5 minutes per IP; one user's incremental sync is
 * usually 1 request, so a short pause between users is enough.
 */

export interface DailyResult {
  demo: "regenerated" | "failed";
  hevy: Array<{ userId: string; status: string; upserted: number; deleted: number }>;
  skipped: number;
  rateLimitRowsPurged: number;
}

export async function runDaily(
  opts: { db?: Db; budgetMs?: number; factory?: ApiFactory; pauseMs?: number } = {},
): Promise<DailyResult> {
  const db = opts.db ?? getDb();
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const out: DailyResult = { demo: "regenerated", hevy: [], skipped: 0, rateLimitRowsPurged: 0 };

  try {
    await regenerateDemo(db);
  } catch (e) {
    console.error("cron: demo regeneration failed", e);
    out.demo = "failed";
  }

  const due = await db
    .select({ userId: connection.userId })
    .from(connection)
    .innerJoin(user, eq(user.id, connection.userId))
    .where(
      and(
        eq(connection.provider, HEVY),
        inArray(connection.status, ["active", "error"]),
        eq(user.emailVerified, true),
        sql`coalesce(${user.isDemo}, false) = false`,
      ),
    )
    .orderBy(sql`${connection.lastSyncAt} asc nulls first`, asc(connection.userId));

  for (const [i, { userId }] of due.entries()) {
    // Leave room for one more sync (each stops itself at its own deadline).
    if (Date.now() > deadline - 30_000) {
      out.skipped = due.length - i;
      break;
    }
    const r = await syncHevy(userId, {
      db,
      deadline: Math.min(deadline - 5_000, Date.now() + 60_000),
      ...(opts.factory ? { factory: opts.factory } : {}),
    });
    out.hevy.push({ userId, status: r.status, upserted: r.upserted, deleted: r.deleted });
    if (opts.pauseMs !== 0) await new Promise((res) => setTimeout(res, opts.pauseMs ?? 250));
  }

  const purged = await db
    .delete(ingestRateLimit)
    .where(lt(ingestRateLimit.windowStart, new Date(Date.now() - 2 * 86_400_000)))
    .returning({ key: ingestRateLimit.key });
  out.rateLimitRowsPurged = purged.length;
  return out;
}
