import { batchRequestSchema } from "@/lib/importers/schemas";
import { applyBatch } from "@/server/importers/batch";
import { apiWriter } from "@/server/dal";

export const maxDuration = 60;

/** POST { kind, source, jobId?, final?, rows[] ≤ 2000 } → { jobId, counts }. Session auth. */
export async function POST(req: Request) {
  const user = await apiWriter();
  if (user instanceof Response) return user;

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 4_400_000)
    return Response.json({ error: "Batch too large; send smaller chunks" }, { status: 413 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = batchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid batch", issues: parsed.error.issues.slice(0, 10) },
      { status: 400 },
    );
  }
  try {
    return Response.json(await applyBatch(user.id, parsed.data));
  } catch (e) {
    console.error("import batch failed", e);
    return Response.json({ error: "Import failed. The job was marked as failed." }, { status: 500 });
  }
}
