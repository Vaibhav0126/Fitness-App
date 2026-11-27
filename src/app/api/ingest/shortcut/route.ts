import { isValidTimeZone } from "@/lib/engine/config";
import { localDate } from "@/lib/engine/dates";
import { shortcutPayloadSchema, shortcutToMetrics } from "@/lib/importers/shortcut";
import { ingestRecords } from "@/server/importers/ingest";
import { ingestRequest } from "@/server/ingest/http";
import { SHORTCUT_LIMITS } from "@/server/ingest/limits";
import { getSettings } from "@/server/queries/settings";
import { rateLimitHeaders } from "@/server/rate-limit";

export const maxDuration = 30;

/**
 * POST /api/ingest/shortcut — daily metrics from the iOS Shortcut (docs/shortcut.md).
 * Authorization: Bearer <upload token>. Idempotent: re-sending a day changes nothing.
 */
export async function POST(req: Request) {
  const ctx = await ingestRequest(req, SHORTCUT_LIMITS);
  if (ctx instanceof Response) return ctx;
  const headers = rateLimitHeaders(ctx.rate);

  const parsed = shortcutPayloadSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Unexpected payload. Expected { v: 1, tz?, days: [{ date, ... }] } with 1–14 days.",
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }
  const settings = await getSettings(ctx.owner.userId);
  const tz = parsed.data.tz && isValidTimeZone(parsed.data.tz) ? parsed.data.tz : settings.timeZone;
  const { metrics, skipped } = shortcutToMetrics(parsed.data, localDate(new Date(), tz));

  try {
    const result = metrics.length
      ? await ingestRecords(ctx.owner.userId, "shortcut", "iOS Shortcut", { metrics })
      : null;
    return Response.json(
      {
        ok: true,
        received: metrics.length,
        counts: result?.counts ?? {},
        skipped,
        ...(metrics.length
          ? {}
          : {
              warning:
                "No values in this request. If the iPhone was locked, Health data can't be read; the next run fills it in.",
            }),
      },
      { headers },
    );
  } catch (e) {
    console.error("shortcut ingest failed", e);
    return Response.json({ error: "Import failed" }, { status: 500, headers });
  }
}
