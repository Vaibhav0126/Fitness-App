import type { BatchRequest } from "./schemas";

/*
 * Browser-side chunked upload to /api/import/batch. One import job spans all chunks
 * (and both metrics and workouts for an HAE file); the last chunk closes it.
 */

export interface UploadProgress {
  sent: number;
  total: number;
}

export interface UploadSummary {
  jobId: string;
  counts: Record<string, number>;
  unknownExercises: string[];
}

type Part = { kind: BatchRequest["kind"]; rows: BatchRequest["rows"]; chunk: number };

export async function uploadInChunks(
  source: BatchRequest["source"],
  fileName: string,
  parts: Part[],
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadSummary> {
  const chunks: Array<{ kind: Part["kind"]; rows: Part["rows"] }> = [];
  for (const p of parts) {
    for (let i = 0; i < p.rows.length; i += p.chunk)
      chunks.push({ kind: p.kind, rows: p.rows.slice(i, i + p.chunk) });
  }
  if (!chunks.length) throw new Error("Nothing to import.");
  const total = parts.reduce((n, p) => n + p.rows.length, 0);
  let sent = 0;
  let jobId: string | undefined;
  const counts: Record<string, number> = {};
  const unknown = new Set<string>();
  for (const [i, c] of chunks.entries()) {
    const res = await fetch("/api/import/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: c.kind,
        source,
        fileName,
        jobId,
        final: i === chunks.length - 1,
        rows: c.rows,
      }),
      signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      jobId?: string;
      counts?: Record<string, number>;
      unknownExercises?: string[];
    };
    if (!res.ok || !body.jobId) throw new Error(body.error ?? `Import failed (HTTP ${res.status}).`);
    jobId = body.jobId;
    for (const [k, v] of Object.entries(body.counts ?? {})) counts[k] = (counts[k] ?? 0) + v;
    for (const u of body.unknownExercises ?? []) unknown.add(u);
    sent += c.rows.length;
    onProgress?.({ sent, total });
  }
  return { jobId: jobId!, counts, unknownExercises: [...unknown].sort() };
}

/** "12 new, 3 updated, 40 unchanged" for one prefix of the counts. */
export function describeCounts(counts: Record<string, number>, prefix: string): string | null {
  const i = counts[`${prefix}Inserted`] ?? 0;
  const u = counts[`${prefix}Updated`] ?? 0;
  const s = counts[`${prefix}Unchanged`] ?? 0;
  if (!i && !u && !s) return null;
  return `${i} new, ${u} updated, ${s} unchanged`;
}
