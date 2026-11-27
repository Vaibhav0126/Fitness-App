import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { importJob } from "@/lib/db/schema";
import type { BatchRequest } from "@/lib/importers/schemas";
import { bumpDataVersion } from "../cache";
import { addJobCounts, failJob, finishJob, startJob } from "./jobs";
import { mergeMetrics, mergeSets, mergeWorkouts } from "./merge";

export interface BatchResult {
  jobId: string;
  counts: Record<string, number>;
  unknownExercises?: string[];
}

const JOB_KIND: Record<BatchRequest["source"], string> = {
  csv_hevy: "Hevy CSV",
  csv_strong: "Strong CSV",
  csv: "CSV",
  hae: "Health Auto Export",
  manual: "Manual",
};

/** Applies one chunk of an import. The caller has already authorized a writable user. */
export async function applyBatch(userId: string, req: BatchRequest, db: Db = getDb()): Promise<BatchResult> {
  let jobId = req.jobId;
  if (jobId) {
    const [job] = await scoped(userId, db).select(importJob, eq(importJob.id, jobId));
    if (!job) throw new Error("unknown import job");
  } else {
    jobId = await startJob(userId, `${JOB_KIND[req.source]}${req.fileName ? `: ${req.fileName}` : ""}`, db);
  }
  try {
    const counts: Record<string, number> = {};
    let unknownExercises: string[] | undefined;
    const put = (prefix: string, c: { inserted: number; updated: number; unchanged: number }) => {
      counts[`${prefix}Inserted`] = c.inserted;
      counts[`${prefix}Updated`] = c.updated;
      counts[`${prefix}Unchanged`] = c.unchanged;
    };
    if (req.kind === "metrics") put("metrics", await mergeMetrics(userId, req.source, req.rows, db));
    if (req.kind === "workouts") {
      const r = await mergeWorkouts(userId, req.source, req.rows, db);
      put("workouts", r);
      put("intervals", r.intervals);
    }
    if (req.kind === "sets") {
      const r = await mergeSets(userId, req.source, req.rows, db);
      put("sets", r);
      put("sessions", r.sessions);
      unknownExercises = r.unknownExercises;
    }
    await addJobCounts(userId, jobId, counts, db);
    if (req.final) await finishJob(userId, jobId, db);
    await bumpDataVersion(userId, db);
    return { jobId, counts, ...(unknownExercises ? { unknownExercises } : {}) };
  } catch (e) {
    await failJob(userId, jobId, (e as Error).message, db);
    throw e;
  }
}
