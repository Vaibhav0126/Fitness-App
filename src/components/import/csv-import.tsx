"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { SetRecord } from "@/lib/importers/schemas";
import { describeCounts, uploadInChunks, type UploadSummary } from "@/lib/importers/upload";
import { csvToRecords } from "@/lib/parsers/csv";
import {
  detectPreset,
  normalizeStrengthRows,
  PRESETS,
  type PresetId,
  STRENGTH_FIELDS,
  type StrengthMapping,
} from "@/lib/parsers/strength-csv";

const PREVIEW_ROWS = 20;
const CHUNK = 1000;
const MAX_BYTES = 50 * 1024 * 1024;

type Parsed = { fileName: string; headers: string[]; records: Array<Record<string, string>> };

export function CsvImport({ timeZone, readOnly }: { timeZone: string; readOnly: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<StrengthMapping | null>(null);
  const [preset, setPreset] = useState<PresetId | "custom">("custom");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  const result = useMemo(() => {
    if (!file || !mapping) return null;
    const missing = STRENGTH_FIELDS.filter((f) => f.required && !mapping.columns[f.key]).map((f) => f.label);
    if (missing.length) return { missing, sets: [], skipped: [] };
    return { missing, ...normalizeStrengthRows(file.records, mapping, timeZone) };
  }, [file, mapping, timeZone]);

  const onFile = async (f: File | undefined) => {
    setError(null);
    setSummary(null);
    setFile(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("That file is over 50 MB. Export a shorter date range.");
    try {
      const { headers, records } = csvToRecords(await f.text());
      if (!headers.length || !records.length) return setError("No rows found in that file.");
      const detected = detectPreset(headers);
      setFile({ fileName: f.name, headers, records });
      setPreset(detected?.id ?? "custom");
      setMapping(
        detected?.mapping ?? {
          source: "csv",
          weightUnit: "kg",
          columns: Object.fromEntries(
            STRENGTH_FIELDS.map((fld) => [
              fld.key,
              headers.find((h) =>
                h
                  .toLowerCase()
                  .replace(/[^a-z]/g, "")
                  .includes(fld.key.toLowerCase()),
              ),
            ]).filter(([, v]) => v),
          ),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const upload = async () => {
    if (!file || !mapping || !result?.sets.length) return;
    setError(null);
    setProgress({ sent: 0, total: result.sets.length });
    try {
      const s = await uploadInChunks(
        mapping.source,
        file.fileName,
        [{ kind: "sets", rows: result.sets as SetRecord[], chunk: CHUNK }],
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
        <Label htmlFor="csv-file">Strength CSV</Label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Hevy: Profile → Settings → Export &amp; Import Data → Export workouts. Strong: Settings → Export
          Strong Data. Parsed in your browser; only the sets are sent.
        </p>
      </div>

      {file && mapping ? (
        <>
          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Columns {preset !== "custom" ? `(detected: ${PRESETS[preset].label})` : "(map manually)"}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="preset" className="text-xs">
                  Preset
                </Label>
                <Select
                  id="preset"
                  value={preset}
                  onChange={(e) => {
                    const id = e.target.value as PresetId | "custom";
                    setPreset(id);
                    if (id !== "custom") setMapping(structuredClone(PRESETS[id].mapping));
                    else setMapping({ ...mapping, source: "csv" });
                  }}
                >
                  <option value="hevy">Hevy</option>
                  <option value="strong">Strong</option>
                  <option value="custom">Custom mapping</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="unit" className="text-xs">
                  Weight unit in the file
                </Label>
                <Select
                  id="unit"
                  value={mapping.weightUnit}
                  onChange={(e) => setMapping({ ...mapping, weightUnit: e.target.value as "kg" | "lb" })}
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </Select>
              </div>
              {STRENGTH_FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label htmlFor={`col-${f.key}`} className="text-xs">
                    {f.label}
                    {f.required ? " *" : ""}
                  </Label>
                  <Select
                    id={`col-${f.key}`}
                    value={mapping.columns[f.key] ?? ""}
                    onChange={(e) => {
                      const columns = { ...mapping.columns };
                      if (e.target.value) columns[f.key] = e.target.value;
                      else delete columns[f.key];
                      setPreset("custom");
                      setMapping({ ...mapping, source: mapping.source, columns });
                    }}
                  >
                    <option value="">(none)</option>
                    {file.headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </fieldset>

          {result?.missing.length ? (
            <FormError message={`Map the required columns: ${result.missing.join(", ")}.`} />
          ) : result ? (
            <section className="grid gap-2" aria-label="Preview">
              <p className="text-sm">
                <strong>{result.sets.length}</strong> sets from {file.records.length} rows
                {result.skipped.length ? `, ${result.skipped.length} rows skipped` : ""}. Times read in{" "}
                {timeZone}.
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {["Session", "Exercise", "#", "Type", "kg", "Reps", "RPE"].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sets.slice(0, PREVIEW_ROWS).map((s) => (
                      <tr key={s.externalId} className="border-t">
                        <td className="px-2 py-1 whitespace-nowrap">
                          {new Date(s.performedAt).toLocaleString(undefined, {
                            timeZone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-2 py-1">{s.exerciseRaw}</td>
                        <td className="px-2 py-1">{s.setIndex}</td>
                        <td className="px-2 py-1">{s.setType}</td>
                        <td className="px-2 py-1 tabular-nums">{s.weightKg ?? "–"}</td>
                        <td className="px-2 py-1 tabular-nums">{s.reps}</td>
                        <td className="px-2 py-1 tabular-nums">{s.rpe ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.skipped.length ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Skipped rows</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {result.skipped.slice(0, 50).map((s) => (
                      <li key={s.row}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="flex items-center gap-3">
                <Button onClick={upload} disabled={readOnly || Boolean(progress) || !result.sets.length}>
                  {progress
                    ? `Importing ${progress.sent}/${progress.total}…`
                    : `Import ${result.sets.length} sets`}
                </Button>
                {readOnly ? <span className="text-sm text-muted-foreground">Demo is read-only.</span> : null}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <FormError message={error} />
      {summary ? (
        <ImportSummary
          summary={summary}
          rows={[
            ["Sets", "sets"],
            ["Sessions", "sessions"],
          ]}
        />
      ) : null}
    </div>
  );
}

export function ImportSummary({ summary, rows }: { summary: UploadSummary; rows: Array<[string, string]> }) {
  return (
    <div role="status" className="grid gap-1 rounded-md border border-good/40 bg-good/10 p-3 text-sm">
      <p className="font-medium">Import complete.</p>
      {rows.map(([label, prefix]) => {
        const d = describeCounts(summary.counts, prefix);
        return d ? (
          <p key={prefix}>
            {label}: {d}
          </p>
        ) : null;
      })}
      {summary.unknownExercises.length ? (
        <p className="text-muted-foreground">
          Not in the exercise catalog (kept as named, no muscle group yet):{" "}
          {summary.unknownExercises.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
