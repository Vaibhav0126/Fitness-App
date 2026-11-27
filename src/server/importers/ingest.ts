import "server-only";
import type { z } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import {
  MAX_ROWS_PER_BATCH,
  metricRecordSchema,
  type MetricRecord,
  setRecordSchema,
  type SetRecord,
  workoutRecordSchema,
  type WorkoutRecord,
} from "@/lib/importers/schemas";
import { bumpDataVersion } from "../cache";
import { addJobCounts, failJob, finishJob, startJob } from "./jobs";
import { addCounts, type MergeCounts, mergeMetrics, mergeSets, mergeWorkouts } from "./merge";

/*
 * Server-side imports (push endpoints and API syncs). Same validation and merge rules as
 * the browser's chunked /api/import/batch: records pass the same Zod schemas, then the
 * same idempotent merge-upserts, recorded as one import job.
 */

export interface IngestRecords {
  metrics?: MetricRecord[];
  workouts?: WorkoutRecord[];
  sets?: SetRecord[];
}

export interface IngestResult {
  jobId: string;
  counts: Record<string, number>;
  /** Records that failed validation (index into their list + first issue). */
  rejected: Array<{ kind: string; index: number; reason: string }>;
  unknownExercises: string[];
}

function validate<T>(
  kind: string,
  schema: z.ZodType<T>,
  rows: unknown[],
  rejected: IngestResult["rejected"],
) {
  const ok: T[] = [];
  rows.forEach((r, index) => {
    const p = schema.safeParse(r);
    if (p.success) ok.push(p.data);
    else if (rejected.length < 50) {
      const i = p.error.issues[0];
      rejected.push({ kind, index, reason: `${i?.path.join(".") ?? ""}: ${i?.message ?? "invalid"}` });
    }
  });
  return ok;
}

const chunks = <T>(rows: T[], size = MAX_ROWS_PER_BATCH): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

export async function ingestRecords(
  userId: string,
  source: string,
  jobKind: string,
  records: IngestRecords,
  db: Db = getDb(),
  opts: { overwriteSets?: boolean } = {},
): Promise<IngestResult> {
  const rejected: IngestResult["rejected"] = [];
  const metrics = validate("metric", metricRecordSchema, records.metrics ?? [], rejected);
  const workouts = validate("workout", workoutRecordSchema, records.workouts ?? [], rejected);
  const sets = validate("set", setRecordSchema, records.sets ?? [], rejected);

  const jobId = await startJob(userId, jobKind, db);
  try {
    const counts: Record<string, number> = {};
    const put = (prefix: string, c: MergeCounts) => {
      counts[`${prefix}Inserted`] = (counts[`${prefix}Inserted`] ?? 0) + c.inserted;
      counts[`${prefix}Updated`] = (counts[`${prefix}Updated`] ?? 0) + c.updated;
      counts[`${prefix}Unchanged`] = (counts[`${prefix}Unchanged`] ?? 0) + c.unchanged;
    };
    const unknown = new Set<string>();
    for (const rows of chunks(metrics)) put("metrics", await mergeMetrics(userId, source, rows, db));
    for (const rows of chunks(workouts, 200)) {
      const r = await mergeWorkouts(userId, source, rows, db);
      put("workouts", r);
      put("intervals", r.intervals);
    }
    let sessions: MergeCounts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const rows of chunks(sets)) {
      const r = await mergeSets(userId, source, rows, db, { overwrite: opts.overwriteSets ?? false });
      put("sets", r);
      sessions = addCounts(sessions, r.sessions);
      r.unknownExercises.forEach((e) => unknown.add(e));
    }
    if (sets.length) put("sessions", sessions);
    if (rejected.length) counts.rejected = rejected.length;
    await addJobCounts(userId, jobId, counts, db);
    await finishJob(userId, jobId, db);
    if (changed(counts)) await bumpDataVersion(userId, db);
    return { jobId, counts, rejected, unknownExercises: [...unknown].sort() };
  } catch (e) {
    await failJob(userId, jobId, (e as Error).message, db);
    throw e;
  }
}

/** True when any merge inserted or updated a row. */
export const changed = (counts: Record<string, number>) =>
  Object.entries(counts).some(([k, v]) => v > 0 && (k.endsWith("Inserted") || k.endsWith("Updated")));
