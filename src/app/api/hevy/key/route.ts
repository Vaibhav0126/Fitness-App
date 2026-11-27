import { z } from "zod";
import { apiWriter } from "@/server/dal";
import { disconnectHevy, HevyKeyError, saveHevyKey } from "@/server/integrations/hevy";
import { hit, tooManyRequests } from "@/server/rate-limit";

export const maxDuration = 30;

const bodySchema = z.object({ apiKey: z.string().min(1).max(300) });

/** POST { apiKey } → validates the key with one Hevy request and stores it encrypted. Session auth. */
export async function POST(req: Request) {
  const user = await apiWriter();
  if (user instanceof Response) return user;
  const rate = await hit(`hevy-key:user:${user.id}`, 10, 600);
  if (!rate.ok) return tooManyRequests(rate);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { apiKey }" }, { status: 400 });
  try {
    const { lastFour } = await saveHevyKey(user.id, parsed.data.apiKey);
    return Response.json({ ok: true, lastFour });
  } catch (e) {
    if (e instanceof HevyKeyError) return Response.json({ error: e.message }, { status: 422 });
    console.error("hevy key save failed", e);
    return Response.json({ error: "Couldn't save the key" }, { status: 500 });
  }
}

/** DELETE → forgets the key (synced workouts stay). */
export async function DELETE() {
  const user = await apiWriter();
  if (user instanceof Response) return user;
  await disconnectHevy(user.id);
  return Response.json({ ok: true });
}
