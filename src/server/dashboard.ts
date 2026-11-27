import "server-only";
import { cache } from "react";
import { computeState, type DashboardState } from "@/lib/engine";
import { localParts } from "@/lib/engine/dates";
import type { EngineStore } from "@/lib/engine/types";
import { cached } from "./cache";
import { getSettings, type Settings } from "./queries/settings";
import { loadEngineStore, storeWindow } from "./queries/store";

/*
 * Dashboard state per user, cached by (data_version, local date, local hour):
 *   - the store (DB reads) is reused until the data version or the local date changes;
 *   - the computed state until the hour changes (the engine has 10:00/12:00 rules).
 * Every write bumps data_version (see cache.ts), so imports show up immediately.
 */

export interface Dashboard {
  state: DashboardState;
  store: EngineStore;
  settings: Settings;
}

export const getDashboardBundle = cache(async (userId: string): Promise<Dashboard> => {
  const settings = await getSettings(userId);
  const now = new Date();
  const { date, hour } = localParts(now, settings.config.timeZone);
  const base = `${userId}:${settings.dataVersion}:${settings.config.timeZone}:${date}`;
  const store = await cached(`${base}:store`, () =>
    loadEngineStore(userId, undefined, storeWindow(now, settings.config.planStart)),
  );
  const state = await cached(`${base}:${hour}:state`, async () => computeState(store, settings.config, now));
  return { state, store, settings };
});

export const getDashboard = async (userId: string): Promise<DashboardState> =>
  (await getDashboardBundle(userId)).state;
