import "server-only";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { userSettings } from "@/lib/db/schema";
import { defaultPlanConfig, type PlanConfig, planConfigSchema } from "@/lib/engine/config";
import { localDate } from "@/lib/engine/dates";

export interface Settings {
  timeZone: string;
  units: "metric" | "imperial";
  config: PlanConfig;
  onboardingDone: boolean;
  dataVersion: number;
}

/** Returns the user's settings, creating the template config on first access. */
export async function getSettings(userId: string, db: Db = getDb(), now = new Date()): Promise<Settings> {
  const s = scoped(userId, db);
  const [row] = await s.select(userSettings);
  if (row) {
    const parsed = planConfigSchema.safeParse(row.config);
    // A config that no longer validates (schema change) falls back to the template so pages still render.
    const config = parsed.success
      ? parsed.data
      : defaultPlanConfig({ timeZone: row.timeZone, planStart: localDate(now, row.timeZone) });
    return {
      timeZone: row.timeZone,
      units: row.units,
      config,
      onboardingDone: row.onboardingDone,
      dataVersion: row.dataVersion,
    };
  }
  const timeZone = "UTC";
  const config = defaultPlanConfig({ timeZone, planStart: localDate(now, timeZone) });
  await s.insert(userSettings, [{ timeZone, config }]).onConflictDoNothing();
  return { timeZone, units: "metric", config, onboardingDone: false, dataVersion: 0 };
}
