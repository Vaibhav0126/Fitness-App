"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriter } from "../dal";
import { disconnectHevy, HevyKeyError, saveHevyKey, syncHevy } from "../integrations/hevy";
import { hit } from "../rate-limit";
import { createToken, revokeToken, TokenLimitError } from "../tokens";
import { type ActionResult, run, UserError } from "./result";

const PATH = "/app/settings/connections";

const tokenNameSchema = z.string().trim().min(1, "Give the token a name").max(60);

/** Creates an upload token and returns it once (the server keeps only its hash). */
export async function createUploadToken(
  _: unknown,
  form: FormData,
): Promise<ActionResult<{ token: string; name: string }>> {
  return run(async () => {
    const me = await requireWriter();
    const name = tokenNameSchema.safeParse(form.get("name"));
    if (!name.success) throw new UserError(name.error.issues[0]?.message ?? "Invalid name");
    try {
      const { token } = await createToken(me.id, name.data);
      revalidatePath(PATH);
      return { token, name: name.data };
    } catch (e) {
      if (e instanceof TokenLimitError) throw new UserError(e.message);
      throw e;
    }
  });
}

export async function revokeUploadToken(id: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    if (!z.uuid().safeParse(id).success || !(await revokeToken(me.id, id)))
      throw new UserError("Token not found.");
    revalidatePath(PATH);
  }, "Token revoked.");
}

export async function connectHevy(_: unknown, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    if (!(await hit(`hevy-key:user:${me.id}`, 10, 600)).ok)
      throw new UserError("Too many attempts. Try again in a few minutes.");
    const key = String(form.get("apiKey") ?? "");
    try {
      await saveHevyKey(me.id, key);
    } catch (e) {
      if (e instanceof HevyKeyError) throw new UserError(e.message);
      throw e;
    }
    // First sync right away; a long history continues on "Sync now" or the daily cron.
    const r = await syncHevy(me.id, { deadline: Date.now() + 40_000 });
    revalidatePath(PATH);
    if (r.status === "error") throw new UserError(`Key saved, but the first sync failed: ${r.error}`);
    return;
  }, "Hevy connected.");
}

export async function syncHevyNow(): Promise<ActionResult<{ message: string }>> {
  return run(async () => {
    const me = await requireWriter();
    if (!(await hit(`hevy-sync:user:${me.id}`, 12, 3600)).ok)
      throw new UserError("Synced recently. Try again later.");
    const r = await syncHevy(me.id, { deadline: Date.now() + 45_000 });
    revalidatePath(PATH);
    if (r.status === "not_connected") throw new UserError("Connect Hevy first.");
    if (r.status === "error") throw new UserError(r.error ?? "Sync failed.");
    const parts = [
      `${r.upserted} workout${r.upserted === 1 ? "" : "s"} checked`,
      r.sets.inserted ? `${r.sets.inserted} new sets` : null,
      r.sets.updated ? `${r.sets.updated} updated` : null,
      r.deleted ? `${r.deleted} deleted` : null,
    ].filter(Boolean);
    return {
      message:
        (r.status === "partial" ? "Partly synced (long history); run again to continue. " : "Synced. ") +
        parts.join(", ") +
        ".",
    };
  });
}

export async function disconnectHevyAction(): Promise<ActionResult> {
  return run(async () => {
    const me = await requireWriter();
    await disconnectHevy(me.id);
    revalidatePath(PATH);
  }, "Hevy disconnected. Synced workouts were kept.");
}
