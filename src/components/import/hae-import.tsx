"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MetricRecord, WorkoutRecord } from "@/lib/importers/schemas";
import { uploadInChunks, type UploadSummary } from "@/lib/importers/upload";
import type { HaeParseResult } from "@/lib/parsers/hae";
import type { HaeWorkerRequest } from "@/lib/parsers/hae.worker";
import { ImportSummary } from "./csv-import";

type Parsed = Array<HaeParseResult & { name: string }>;

const MAX_BYTES = 200 * 1024 * 1024;

function parseInWorker(req: HaeWorkerRequest): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../lib/parsers/hae.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<{ ok: true; results: Parsed } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.results);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Couldn't parse the file."));
    };
    worker.postMessage(req);
  });
}

export function HaeImport({
  timeZone,
  runClassification,
  readOnly,
}: {
  timeZone: string;
  runClassification: { walkSpeedKmh: number; marginKmh: number };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  const metrics = parsed?.flatMap((p) => p.metrics) ?? [];
  const workouts = parsed?.flatMap((p) => p.workouts) ?? [];
  const runs = workouts.filter((w) => w.type === "run");
  const intervals = workouts.reduce((n, w) => n + (w.intervals?.length ?? 0), 0);
  const unknown = [...new Set(parsed?.flatMap((p) => p.unknownMetrics) ?? [])];
  const skipped = parsed?.flatMap((p) => p.skipped) ?? [];
  const days = new Set(metrics.map((m) => m.date));
  const range = days.size ? [[...days].sort()[0], [...days].sort().at(-1)] : null;

  const onFiles = async (list: FileList | null) => {
    setError(null);
    setSummary(null);
    setParsed(null);
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (files.some((f) => f.size > MAX_BYTES))
      return setError("A file is over 200 MB. Export a shorter range.");
    setParsing(true);
    try {
      setParsed(await parseInWorker({ files, timeZone, runClassification }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse the file.");
    } finally {
      setParsing(false);
    }
  };

  const upload = async () => {
    if (!parsed) return;
    setError(null);
    try {
      const s = await uploadInChunks(
        "hae",
        parsed
          .map((p) => p.name)
          .join(", ")
          .slice(0, 200),
        [
          { kind: "metrics", rows: metrics as MetricRecord[], chunk: 2000 },
          { kind: "workouts", rows: workouts as WorkoutRecord[], chunk: 100 },
        ].filter((p) => p.rows.length) as Parameters<typeof uploadInChunks>[2],
        setProgress,
      );
      setSummary(s);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="hae-files">Health Auto Export JSON (v2)</Label>
        <input
          id="hae-files"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
        />
        <p className="text-xs text-muted-foreground">
          In Health Auto Export, create a JSON export (format v2) of Health Metrics and/or Workouts, then pick
          Metrics.json and Workouts.json here. Parsed in your browser; the raw files are never uploaded.
        </p>
      </div>
      {parsing ? <p className="text-sm text-muted-foreground">Parsing…</p> : null}
      {parsed ? (
        <section aria-label="Preview" className="grid gap-2 text-sm">
          <ul className="grid gap-1">
            <li>
              <strong>{metrics.length}</strong> daily values
              {range ? ` from ${range[0]} to ${range[1]}` : ""}
            </li>
            <li>
              <strong>{workouts.length}</strong> workouts ({runs.length} runs, {intervals} intervals)
            </li>
          </ul>
          {runs.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted">
                  <tr>
                    {["Start", "Type", "Min", "km", "Run/walk"].map((h) => (
                      <th key={h} className="px-2 py-1.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workouts.slice(0, 20).map((w) => (
                    <tr key={w.externalId} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {new Date(w.start).toLocaleString(undefined, {
                          timeZone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-2 py-1">{w.type}</td>
                      <td className="px-2 py-1 tabular-nums">
                        {w.durationS ? Math.round(w.durationS / 60) : "–"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {w.distanceM ? (w.distanceM / 1000).toFixed(2) : "–"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {w.intervals?.length
                          ? `${w.intervals.filter((i) => i.kind === "run").length} / ${w.intervals.filter((i) => i.kind === "walk").length}`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {unknown.length || skipped.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ignored items</summary>
              {unknown.length ? (
                <p className="mt-1">Metrics Train doesn&apos;t use yet: {unknown.join(", ")}</p>
              ) : null}
              <ul className="mt-1 list-disc pl-4">
                {skipped.slice(0, 30).map((s, i) => (
                  <li key={i}>
                    {s.item}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              onClick={upload}
              disabled={readOnly || Boolean(progress) || (!metrics.length && !workouts.length)}
            >
              {progress ? `Importing ${progress.sent}/${progress.total}…` : "Import"}
            </Button>
            {readOnly ? <span className="text-sm text-muted-foreground">Demo is read-only.</span> : null}
          </div>
        </section>
      ) : null}
      <FormError message={error} />
      {summary ? (
        <ImportSummary
          summary={summary}
          rows={[
            ["Daily values", "metrics"],
            ["Workouts", "workouts"],
            ["Intervals", "intervals"],
          ]}
        />
      ) : null}
    </div>
  );
}
