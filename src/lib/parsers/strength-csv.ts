import { aliasKey } from "../exercises/catalog";
import type { NormalizedSet } from "../importers/adapter";
import { parseDateTime } from "./datetime";

/*
 * Strength CSVs (Hevy, Strong or anything with one row per set) → NormalizedSet[].
 * Runs in the browser; only normalized rows are sent to the server.
 */

export const STRENGTH_FIELDS = [
  { key: "start", label: "Session start", required: true },
  { key: "end", label: "Session end", required: false },
  { key: "title", label: "Session title", required: false },
  { key: "exercise", label: "Exercise", required: true },
  { key: "setIndex", label: "Set number", required: false },
  { key: "setType", label: "Set type", required: false },
  { key: "weight", label: "Weight", required: false },
  { key: "reps", label: "Reps", required: true },
  { key: "rpe", label: "RPE", required: false },
] as const;

export type StrengthField = (typeof STRENGTH_FIELDS)[number]["key"];

export interface StrengthMapping {
  columns: Partial<Record<StrengthField, string>>;
  weightUnit: "kg" | "lb";
  source: "csv_hevy" | "csv_strong" | "csv";
}

export type PresetId = "hevy" | "strong";

export const PRESETS: Record<PresetId, { label: string; mapping: StrengthMapping; signature: string[] }> = {
  hevy: {
    label: "Hevy",
    signature: ["title", "start_time", "exercise_title", "set_index"],
    mapping: {
      source: "csv_hevy",
      weightUnit: "kg",
      columns: {
        start: "start_time",
        end: "end_time",
        title: "title",
        exercise: "exercise_title",
        setIndex: "set_index",
        setType: "set_type",
        weight: "weight_kg",
        reps: "reps",
        rpe: "rpe",
      },
    },
  },
  strong: {
    label: "Strong",
    signature: ["Date", "Workout Name", "Exercise Name", "Set Order"],
    mapping: {
      source: "csv_strong",
      weightUnit: "kg",
      columns: {
        start: "Date",
        title: "Workout Name",
        exercise: "Exercise Name",
        setIndex: "Set Order",
        weight: "Weight",
        reps: "Reps",
        rpe: "RPE",
      },
    },
  },
};

/** Picks a preset whose signature columns are all present; adjusts Hevy's pound exports. */
export function detectPreset(headers: string[]): { id: PresetId; mapping: StrengthMapping } | null {
  const has = (h: string) => headers.includes(h);
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = PRESETS[id];
    if (p.signature.every(has)) {
      const mapping: StrengthMapping = { ...p.mapping, columns: { ...p.mapping.columns } };
      if (id === "hevy" && !has("weight_kg") && has("weight_lbs")) {
        mapping.columns.weight = "weight_lbs";
        mapping.weightUnit = "lb";
      }
      return { id, mapping };
    }
  }
  return null;
}

const LB_TO_KG = 0.45359237;

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Hevy set_type / Strong Set Order letters → normalized set type. */
function setTypeOf(typeCell: string | undefined, orderCell: string | undefined): string {
  const t = (typeCell ?? "").trim().toLowerCase();
  if (t) {
    if (t.startsWith("warm")) return "warmup";
    if (t.startsWith("drop")) return "dropset";
    if (t.startsWith("fail")) return "failure";
    return "normal";
  }
  const o = (orderCell ?? "").trim().toUpperCase();
  if (o === "W") return "warmup";
  if (o === "D") return "dropset";
  if (o === "F") return "failure";
  return "normal";
}

export interface StrengthParseResult {
  sets: NormalizedSet[];
  skipped: Array<{ row: number; reason: string }>;
}

export function normalizeStrengthRows(
  records: Array<Record<string, string>>,
  mapping: StrengthMapping,
  timeZone: string,
): StrengthParseResult {
  const col = (r: Record<string, string>, f: StrengthField) => {
    const name = mapping.columns[f];
    return name ? r[name] : undefined;
  };
  const sets: NormalizedSet[] = [];
  const skipped: StrengthParseResult["skipped"] = [];
  const counters = new Map<string, number>();

  records.forEach((r, i) => {
    const rowNo = i + 2; // 1-based, after the header
    const exerciseRaw = (col(r, "exercise") ?? "").trim();
    const startRaw = col(r, "start") ?? "";
    if (!exerciseRaw) return void skipped.push({ row: rowNo, reason: "no exercise" });
    const orderCell = col(r, "setIndex");
    if (orderCell && /rest timer/i.test(orderCell))
      return void skipped.push({ row: rowNo, reason: "rest timer row" });

    let start: Date;
    let end: Date | null = null;
    try {
      start = parseDateTime(startRaw, timeZone).instant;
      const endRaw = col(r, "end");
      if (endRaw) end = parseDateTime(endRaw, timeZone).instant;
    } catch (e) {
      return void skipped.push({ row: rowNo, reason: (e as Error).message });
    }

    const reps = num(col(r, "reps"));
    const weightRaw = num(col(r, "weight"));
    if (reps == null || reps <= 0)
      return void skipped.push({ row: rowNo, reason: "no reps (cardio or timed set)" });
    const weightKg =
      weightRaw == null
        ? null
        : Math.round((mapping.weightUnit === "lb" ? weightRaw * LB_TO_KG : weightRaw) * 100) / 100;

    const sessionStart = start.toISOString();
    const key = `${sessionStart}|${aliasKey(exerciseRaw)}`;
    const explicit = num(orderCell);
    const seq = counters.get(key) ?? 0;
    counters.set(key, seq + 1);
    // Hevy set_index is 0-based; Strong Set Order is 1-based or a letter (W/D/F). The
    // sequence number keeps letter-ordered sets unique and stable across re-imports.
    const setIndex = explicit != null && mapping.source !== "csv_strong" ? explicit : seq;

    sets.push({
      kind: "set",
      externalId: `${sessionStart}|${aliasKey(exerciseRaw)}|${setIndex}`,
      sessionTitle: col(r, "title")?.trim() || null,
      performedAt: sessionStart,
      sessionEnd: end ? end.toISOString() : null,
      exerciseRaw,
      setIndex,
      setType: setTypeOf(col(r, "setType"), orderCell),
      weightKg,
      reps: Math.round(reps),
      rpe: num(col(r, "rpe")),
    });
  });

  return { sets, skipped };
}
