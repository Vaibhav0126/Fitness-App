"use server";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { scoped } from "@/lib/db/scoped";
import { runFeedback, workout } from "@/lib/db/schema";
import { localDate } from "@/lib/engine/dates";
import { parseDateTime } from "@/lib/parsers/datetime";
import { bumpDataVersion } from "../cache";
import { requireWriter } from "../dal";
import { mergeSets, mergeWorkouts } from "../importers/merge";
import { getSettings } from "../queries/settings";
import { type ActionResult, run, UserError } from "./result";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");

const strengthSchema = z.object({
  start: localDateTime,
  title: z.string().trim().max(100).optional(),
  durationMin: z.number().int().min(0).max(600).optional(),
  sets: z
    .array(
      z.object({
        exercise: z.string().trim().min(1, "Every set needs an exercise").max(200),
        weightKg: z.number().min(0).max(1000).nullable(),
        reps: z.number().int().min(1, "Reps must be at least 1").max(1000),
        warmup: z.boolean().optional(),
      }),
    )
    .min(1, "Add at least one set")
    .max(200),
});
export type ManualStrength = z.infer<typeof strengthSchema>;

const issue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

/** Logs one strength session. Sets are numbered per exercise in the order given. */
export async function logStrength(input: ManualStrength): Promise<ActionResult<{ sets: number }>> {
  return run(async () => {
    const me = await requireWriter();
    const parsed = strengthSchema.safeParse(input);
    if (!parsed.success) throw new UserError(issue(parsed.error));
    const { timeZone } = await getSettings(me.id);
    const startIso = parseDateTime(
      parsed.data.start.replace("T", " ") + ":00",
      timeZone,
    ).instant.toISOString();
    const end = parsed.data.durationMin
      ? new Date(Date.parse(startIso) + parsed.data.durationMin * 60_000).toISOString()
      : null;
    const sessionId = randomUUID();
    const perExercise = new Map<string, number>();
    const rows = parsed.data.sets.map((s) => {
      const idx = perExercise.get(s.exercise) ?? 0;
      perExercise.set(s.exercise, idx + 1);
      return {
        kind: "set" as const,
        externalId: `${sessionId}|${s.exercise}|${idx}`,
        sessionTitle: parsed.data.title || "Logged session",
        performedAt: startIso,
        sessionEnd: end,
        exerciseRaw: s.exercise,
        setIndex: idx,
        setType: s.warmup ? "warmup" : "normal",
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: null,
      };
    });
    const r = await mergeSets(me.id, "manual", rows);
    await bumpDataVersion(me.id);
    return { sets: r.inserted + r.updated };
  }, "Session saved.");
}

const runSchema = z.object({
  start: localDateTime,
  durationMin: z.number().min(1, "Duration is required").max(600),
  distanceKm: z.number().min(0).max(200).nullable(),
  avgHr: z.number().int().min(30).max(250).nullable(),
  maxHr: z.number().int().min(30).max(250).nullable(),
});
export type ManualRun = z.infer<typeof runSchema>;

export async function logRun(input: ManualRun): Promise<ActionResult<{ workoutId: string; date: string }>> {
  return run(async () => {
    const me = await requireWriter();
    const parsed = runSchema.safeParse(input);
    if (!parsed.success) throw new UserError(issue(parsed.error));
    const { timeZone } = await getSettings(me.id);
    const d = parsed.data;
    const start = parseDateTime(d.start.replace("T", " ") + ":00", timeZone).instant;
    const durationS = Math.round(d.durationMin * 60);
    const distanceM = d.distanceKm != null ? Math.round(d.distanceKm * 1000) : null;
    const externalId = `manual-run|${randomUUID()}`;
    await mergeWorkouts(me.id, "manual", [
      {
        kind: "workout",
        externalId,
        type: "run",
        name: "Run (logged)",
        start: start.toISOString(),
        end: new Date(start.getTime() + durationS * 1000).toISOString(),
        durationS,
        distanceM,
        avgHr: d.avgHr,
        maxHr: d.maxHr,
        avgSpeedKmh: distanceM ? Math.round((distanceM / durationS) * 3.6 * 10) / 10 : null,
      },
    ]);
    const [w] = await scoped(me.id).select(
      workout,
      eq(workout.externalId, externalId),
      eq(workout.source, "manual"),
    );
    await bumpDataVersion(me.id);
    return { workoutId: w!.id, date: localDate(start, timeZone) };
  }, "Run saved. Rate your shins below.");
}

const feedbackSchema = z.object({
  workoutId: z.uuid(),
  shinPain: z.number().int().min(0).max(10),
  calfPain: z.number().int().min(0).max(10),
  effort: z.number().int().min(1).max(10),
  note: z.string().trim().max(500).optional(),
});
export type RunFeedbackInput = z.infer<typeof feedbackSchema>;

/** Saves (or replaces) the feedback for one of the user's runs. */
export async function saveRunFeedback(input: RunFeedbackInput): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) throw new UserError(issue(parsed.error));
    const s = scoped(me.id);
    const [w] = await s.select(workout, eq(workout.id, parsed.data.workoutId));
    if (!w) throw new UserError("That run wasn't found.");
    const { timeZone } = await getSettings(me.id);
    const values = {
      workoutId: w.id,
      date: localDate(w.start, timeZone),
      shinPain: parsed.data.shinPain,
      calfPain: parsed.data.calfPain,
      effort: parsed.data.effort,
      note: parsed.data.note || null,
    };
    await s.insert(runFeedback, [values]).onConflictDoUpdate({
      target: [runFeedback.userId, runFeedback.workoutId],
      targetWhere: sql`${runFeedback.workoutId} is not null`,
      set: { ...values, updatedAt: new Date() },
    });
    await bumpDataVersion(me.id);
  }, "Feedback saved.");
}

/** Deletes a manually logged run (imported runs are managed by their source). */
export async function deleteManualRun(workoutId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    await scoped(me.id).delete(workout, and(eq(workout.id, workoutId), eq(workout.source, "manual")));
    await bumpDataVersion(me.id);
  }, "Run deleted.");
}
