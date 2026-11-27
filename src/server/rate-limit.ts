import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { ingestRateLimit } from "@/lib/db/schema";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/**
 * Postgres fixed-window limiter: one atomic upsert per hit, so concurrent requests
 * can't both slip under the limit. A window starts with the first request after the
 * previous one expired.
 */
export async function hit(
  key: string,
  limit: number,
  windowSeconds: number,
  db: Db = getDb(),
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStartCutoff = new Date(now.getTime() - windowSeconds * 1000);
  const expired = sql`${ingestRateLimit.windowStart} <= ${windowStartCutoff}`;
  const [row] = await db
    .insert(ingestRateLimit)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: ingestRateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${ingestRateLimit.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${now} else ${ingestRateLimit.windowStart} end`,
      },
    })
    .returning({ count: ingestRateLimit.count, windowStart: ingestRateLimit.windowStart });
  const count = row!.count;
  const resetAt = row!.windowStart.getTime() + windowSeconds * 1000;
  return {
    ok: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

export function tooManyRequests(r: RateLimitResult, message = "Too many requests"): Response {
  return Response.json(
    { error: message, retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), ...rateLimitHeaders(r) } },
  );
}

export const rateLimitHeaders = (r: RateLimitResult): Record<string, string> => ({
  "X-RateLimit-Limit": String(r.limit),
  "X-RateLimit-Remaining": String(r.remaining),
});
