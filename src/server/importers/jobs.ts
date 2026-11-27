import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { importJob } from "@/lib/db/schema";

export async function startJob(userId: string, kind: string, db: Db = getDb()): Promise<string> {
  const [job] = await scoped(userId, db)
    .insert(importJob, [{ kind, status: "running" }])
    .returning({ id: importJob.id });
  return job!.id;
}

/** Adds numeric counts into the job's JSONB counters. */
export async function addJobCounts(
  userId: string,
  jobId: string,
  counts: Record<string, number>,
  db: Db = getDb(),
) {
  const additions = Object.entries(counts).filter(([, v]) => v !== 0);
  if (!additions.length) return;
  let expr = sql`${importJob.counts}`;
  for (const [k, v] of additions) {
    expr = sql`jsonb_set(${expr}, ${`{${k}}`}::text[], to_jsonb(coalesce((${importJob.counts}->>${k})::numeric, 0) + ${v}))`;
  }
  await scoped(userId, db).update(importJob, { counts: expr as never }, eq(importJob.id, jobId));
}

export async function finishJob(userId: string, jobId: string, db: Db = getDb()) {
  await scoped(userId, db).update(
    importJob,
    { status: "done", finishedAt: new Date() },
    eq(importJob.id, jobId),
  );
}

export async function failJob(userId: string, jobId: string, error: string, db: Db = getDb()) {
  await scoped(userId, db).update(
    importJob,
    { status: "failed", error: error.slice(0, 500), finishedAt: new Date() },
    eq(importJob.id, jobId),
  );
}

export async function listJobs(userId: string, limit = 20, db: Db = getDb()) {
  return db
    .select()
    .from(importJob)
    .where(scoped(userId, db).owns(importJob))
    .orderBy(desc(importJob.startedAt))
    .limit(limit);
}
