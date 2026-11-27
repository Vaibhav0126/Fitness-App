import { apiWriter } from "@/server/dal";
import { syncHevy } from "@/server/integrations/hevy";
import { hit, tooManyRequests } from "@/server/rate-limit";

export const maxDuration = 60;

/** POST → "Sync now". Resumable: a long first sync continues on the next call or the daily cron. */
export async function POST() {
  const user = await apiWriter();
  if (user instanceof Response) return user;
  const rate = await hit(`hevy-sync:user:${user.id}`, 12, 3600);
  if (!rate.ok) return tooManyRequests(rate, "Synced recently. Try again later.");
  const result = await syncHevy(user.id, { deadline: Date.now() + 45_000 });
  const status = result.status === "not_connected" ? 409 : result.status === "error" ? 502 : 200;
  return Response.json(result, { status });
}
