import { DemoReadOnlyError } from "../dal";

export type ActionResult<T = void> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Turns thrown errors into a form-friendly result; the demo block gets its own message. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, ...(message ? { message } : {}) };
  } catch (e) {
    if (e instanceof DemoReadOnlyError) return { ok: false, error: e.message };
    if (e instanceof UserError) return { ok: false, error: e.message };
    // Next.js redirects/notFound are thrown errors with a digest; let them through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}
