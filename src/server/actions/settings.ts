"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { user, userSettings } from "@/lib/db/schema";
import { defaultPlanConfig, emptyPlanConfig, planConfigSchema, timeZoneSchema } from "@/lib/engine/config";
import { localDate } from "@/lib/engine/dates";
import { bumpDataVersion } from "../cache";
import { requireWriter } from "../dal";
import { getSettings } from "../queries/settings";
import { type ActionResult, run, UserError } from "./result";

const onboardingSchema = z.object({
  start: z.enum(["template", "scratch"]),
  timeZone: timeZoneSchema,
});

export async function completeOnboarding(_: unknown, form: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const me = await requireWriter();
    const parsed = onboardingSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new UserError("Pick a starting point and a valid time zone.");
    const { start, timeZone } = parsed.data;
    const planStart = localDate(new Date(), timeZone);
    const config = (start === "template" ? defaultPlanConfig : emptyPlanConfig)({ timeZone, planStart });
    await getSettings(me.id); // ensures the row exists
    await scoped(me.id).update(userSettings, { timeZone, config, onboardingDone: true });
    await bumpDataVersion(me.id);
  });
  if (result.ok) redirect(form.get("start") === "scratch" ? "/app/settings/plan" : "/app/import");
  return result;
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  timeZone: timeZoneSchema,
  units: z.enum(["metric", "imperial"]),
});

export async function saveProfile(_: unknown, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    const parsed = profileSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { name, timeZone, units } = parsed.data;
    const settings = await getSettings(me.id);
    await getDb().update(user).set({ name }).where(eq(user.id, me.id));
    await scoped(me.id).update(userSettings, { timeZone, units, config: { ...settings.config, timeZone } });
    await bumpDataVersion(me.id);
  }, "Saved.");
}

/** Saves the whole plan (from the visual editor or the JSON view). Returns readable validation errors. */
export async function savePlan(json: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new UserError("That isn't valid JSON.");
    }
    const settings = await getSettings(me.id);
    const parsed = planConfigSchema.safeParse({ ...(raw as object), timeZone: settings.timeZone });
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "plan"}: ${i.message}`)
        .join("; ");
      throw new UserError(msg);
    }
    await scoped(me.id).update(userSettings, { config: parsed.data });
    await bumpDataVersion(me.id);
  }, "Plan saved.");
}

export async function deleteAccount(_: unknown, form: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const me = await requireWriter();
    if (
      String(form.get("confirm") ?? "")
        .trim()
        .toLowerCase() !== me.email.toLowerCase()
    ) {
      throw new UserError("Type your email address to confirm.");
    }
    await getAuth().api.signOut({ headers: await headers() });
    // Every app table references user.id with ON DELETE CASCADE.
    await getDb().delete(user).where(eq(user.id, me.id));
  });
  if (result.ok) redirect("/?deleted=1");
  return result;
}
