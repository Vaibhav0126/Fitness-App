import "server-only";
import { cache } from "react";
import { computeState, type DashboardState } from "@/lib/engine";
import { getSettings } from "./queries/settings";
import { loadEngineStore } from "./queries/store";

/**
 * Computes the dashboard on request. The engine is pure and cheap; the cost is the
 * queries, which React `cache` dedupes per render (see PLAN.md R8).
 */
export const getDashboard = cache(async (userId: string): Promise<DashboardState> => {
  const [settings, store] = await Promise.all([getSettings(userId), loadEngineStore(userId)]);
  return computeState(store, settings.config, new Date());
});
