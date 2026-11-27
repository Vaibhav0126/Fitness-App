import { safeEqual } from "@/lib/crypto";
import { runDaily } from "@/server/cron/daily";

/** Vercel Hobby with Fluid compute allows up to 300 s. */
export const maxDuration = 300;

/**
 * GET /api/cron/daily — Vercel Cron (vercel.json) sends `Authorization: Bearer ${CRON_SECRET}`.
 * Without CRON_SECRET configured the endpoint is disabled.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16)
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDaily();
  // Per-user ids stay in the logs; the response only has totals.
  console.info("cron daily", JSON.stringify(result));
  return Response.json({
    demo: result.demo,
    hevySynced: result.hevy.length,
    hevyErrors: result.hevy.filter((h) => h.status === "error").length,
    skipped: result.skipped,
  });
}
