import { type MetricRecord, type WorkoutRecord } from "@/lib/importers/schemas";
import { parseHaeFile } from "@/lib/parsers/hae";
import { ingestRecords } from "@/server/importers/ingest";
import { ingestRequest } from "@/server/ingest/http";
import { HAE_LIMITS } from "@/server/ingest/limits";
import { getSettings } from "@/server/queries/settings";
import { rateLimitHeaders } from "@/server/rate-limit";

export const maxDuration = 60;

/**
 * POST /api/ingest/hae — Health Auto Export v2 JSON pushed by its REST API automation.
 * Authorization: Bearer <upload token>. Same parser and merge rules as the file upload
 * (source "hae"), so a push and a later file upload of the same data merge into one row.
 */
export async function POST(req: Request) {
  const ctx = await ingestRequest(req, HAE_LIMITS);
  if (ctx instanceof Response) return ctx;
  const headers = rateLimitHeaders(ctx.rate);

  const settings = await getSettings(ctx.owner.userId);
  let parsed;
  try {
    parsed = parseHaeFile(ctx.body, {
      timeZone: settings.timeZone,
      runClassification: settings.config.runClassification,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }

  try {
    const result = await ingestRecords(ctx.owner.userId, "hae", "Health Auto Export (automation)", {
      metrics: parsed.metrics as MetricRecord[],
      workouts: parsed.workouts as WorkoutRecord[],
    });
    return Response.json(
      {
        ok: true,
        counts: result.counts,
        rejected: result.rejected,
        skipped: parsed.skipped.slice(0, 50),
        unknownMetrics: parsed.unknownMetrics,
      },
      { headers },
    );
  } catch (e) {
    console.error("hae ingest failed", e);
    return Response.json({ error: "Import failed" }, { status: 500, headers });
  }
}
