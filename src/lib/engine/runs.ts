import { fmtDay, fmtMmSs, localDate } from "./dates";
import type { PlanConfig } from "./config";
import { mean } from "./metrics";
import type { FeedbackRow, Insight, IntervalRow, WorkoutRow } from "./types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const DEDUPE_WINDOW_MS = 20 * 60_000;

export interface Run extends WorkoutRow {
  date: string;
}

/**
 * Runs up to `now` in local dates. The same run recorded by two sources (starts within
 * 20 minutes) is merged: keep the one with more intervals, and borrow missing fields.
 */
export function collectRuns(workouts: WorkoutRow[], timeZone: string, now: Date): Run[] {
  const nowMs = now.getTime();
  const runs = workouts
    .filter((w) => w.type === "run" && Date.parse(w.start) <= nowMs)
    .map((w) => ({
      ...w,
      intervals: [...w.intervals].sort((a, b) => a.idx - b.idx),
      date: localDate(w.start, timeZone),
    }))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const out: Run[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(Date.parse(r.start) - Date.parse(prev.start)) < DEDUPE_WINDOW_MS) {
      const keep = r.intervals.length > prev.intervals.length ? r : prev;
      const other = keep === r ? prev : r;
      out[out.length - 1] = {
        ...keep,
        avgHr: keep.avgHr ?? other.avgHr,
        maxHr: keep.maxHr ?? other.maxHr,
        avgCadence: keep.avgCadence ?? other.avgCadence,
        distanceM: keep.distanceM ?? other.distanceM,
        durationS: keep.durationS ?? other.durationS,
      };
    } else out.push(r);
  }
  return out;
}

export interface RunSummary {
  runIntervals: number;
  avgSpeedKmh: number | null;
  firstSpeedKmh: number | null;
  lastSpeedKmh: number | null;
  peakHr: number | null;
  avgCadence: number | null;
  distanceKm: number | null;
  durationMin: number | null;
}

export function runSummary(r: Run): RunSummary {
  const work = r.intervals.filter((i) => i.kind === "run");
  const nums = (f: (i: IntervalRow) => number | null | undefined) =>
    work.map(f).filter((v): v is number => v != null && Number.isFinite(v));
  const spd = nums((i) => i.avgSpeedKmh);
  const hr = nums((i) => i.maxHr);
  const cad = nums((i) => i.cadence);
  const avgSpeed = spd.length ? r1(mean(spd)!) : r.avgSpeedKmh != null ? r1(r.avgSpeedKmh) : null;
  const avgCad = cad.length ? Math.round(mean(cad)!) : r.avgCadence != null ? Math.round(r.avgCadence) : null;
  return {
    runIntervals: work.length,
    avgSpeedKmh: avgSpeed,
    firstSpeedKmh: spd[0] ?? null,
    lastSpeedKmh: spd[spd.length - 1] ?? null,
    peakHr: hr.length ? Math.max(...hr) : (r.maxHr ?? null),
    avgCadence: avgCad,
    distanceKm: r.distanceM != null ? Math.round(r.distanceM / 10) / 100 : null,
    durationMin: r.durationS != null ? Math.round(r.durationS / 60) : null,
  };
}

export function feedbackFor(run: Run, feedback: FeedbackRow[]): FeedbackRow | null {
  return (
    feedback.find((f) => f.workoutId === run.id) ??
    feedback.find((f) => !f.workoutId && f.date === run.date) ??
    null
  );
}

export interface PlannedRun extends Run {
  planWeek: number;
  runInWeek: number;
  feedback: FeedbackRow | null;
  summary: RunSummary;
}

export interface PlanProgress {
  log: PlannedRun[];
  /** 1-based current week, never beyond the plan length */
  week: number;
  /** All weeks completed */
  complete: boolean;
  /** Runs done in the current week */
  count: number;
  /** A run in the current (unfinished) week had shin pain above the limit */
  repeatPending: boolean;
  /** Weeks that were repeated, with the reason */
  repeats: Array<{ week: number; date: string; shinPain: number }>;
}

/**
 * Every `runsPerWeek` completed runs (on/after planStart, on/before today) advance one
 * week, unless a run in that block had shin pain > shinMax: then the week repeats.
 */
export function planProgress(
  runs: Run[],
  feedback: FeedbackRow[],
  cfg: PlanConfig,
  today: string,
): PlanProgress {
  const len = cfg.runPlan.length;
  const { runsPerWeek, shinMax } = cfg.progression;
  let week = 1;
  let complete = false;
  let count = 0;
  let worstShin: { shin: number; date: string } | null = null;
  const log: PlannedRun[] = [];
  const repeats: PlanProgress["repeats"] = [];
  for (const r of runs.filter((x) => x.date >= cfg.planStart && x.date <= today)) {
    const fb = feedbackFor(r, feedback);
    log.push({ ...r, planWeek: week, runInWeek: count + 1, feedback: fb, summary: runSummary(r) });
    count++;
    if (fb?.shinPain != null && fb.shinPain > shinMax && (!worstShin || fb.shinPain > worstShin.shin)) {
      worstShin = { shin: fb.shinPain, date: r.date };
    }
    if (count >= runsPerWeek) {
      if (worstShin) repeats.push({ week, date: worstShin.date, shinPain: worstShin.shin });
      else if (week < len) week++;
      else complete = true;
      count = 0;
      worstShin = null;
    }
  }
  return { log, week, complete, count, repeatPending: worstShin != null, repeats };
}

/** 2–4 plain-English insights about one run (spec §6.2 "Run analysis"). */
export function analyzeRun(r: PlannedRun, cfg: PlanConfig): Insight[] {
  const t = cfg.runTargets;
  const s = r.summary;
  const out: Insight[] = [];
  const id = (k: string) => `run.${r.id}.${k}`;
  const base = [
    s.distanceKm != null ? `${s.distanceKm} km` : null,
    s.durationMin != null ? `${s.durationMin} min` : null,
    r.avgHr != null ? `avg HR ${Math.round(r.avgHr)}` : null,
  ].filter(Boolean);
  out.push({
    id: id("summary"),
    severity: "info",
    title: `Week ${r.planWeek} run ${r.runInWeek}`,
    text: `${fmtDay(r.date)}${base.length ? `: ${base.join(", ")}` : ""}.`,
    evidence: [`Source: ${r.source}`, `${s.runIntervals} run intervals detected`],
  });

  if (s.avgSpeedKmh != null) {
    const v = s.avgSpeedKmh;
    const band = `${t.speedKmhMin}–${t.speedKmhMax}`;
    const label = s.runIntervals ? "Run intervals averaged" : "Average speed was";
    if (v > t.speedKmhMax)
      out.push({
        id: id("speed"),
        severity: "warn",
        title: "A bit fast",
        text: `${label} ${v} km/h, above your ${band} target. Slow down so the run intervals stay easy.`,
        evidence: [`Average ${v} km/h`, `Target ${band} km/h`],
      });
    else if (v < t.speedKmhMin)
      out.push({
        id: id("speed"),
        severity: "info",
        title: "Easy pace",
        text: `${label} ${v} km/h, below your ${band} target. That's fine early on; speed comes with time.`,
        evidence: [`Average ${v} km/h`, `Target ${band} km/h`],
      });
    else
      out.push({
        id: id("speed"),
        severity: "good",
        title: "On pace",
        text: `${label} ${v} km/h, inside your ${band} target.`,
        evidence: [`Average ${v} km/h`, `Target ${band} km/h`],
      });
  }

  if (s.peakHr != null) {
    const over = s.peakHr > t.hrCap;
    out.push({
      id: id("hr"),
      severity: over ? "warn" : "good",
      title: over ? "Heart rate above cap" : "Heart rate under cap",
      text: over
        ? `HR peaked at ${Math.round(s.peakHr)}, above your ${t.hrCap} cap, so slow the run intervals (especially the last ones).`
        : `HR peaked at ${Math.round(s.peakHr)}, under your ${t.hrCap} cap.`,
      evidence: [`Peak ${Math.round(s.peakHr)} bpm`, `Cap ${t.hrCap} bpm`],
    });
  }

  if (
    out.length < 4 &&
    s.firstSpeedKmh != null &&
    s.lastSpeedKmh != null &&
    s.lastSpeedKmh > s.firstSpeedKmh + 0.7
  ) {
    out.push({
      id: id("pacing"),
      severity: "warn",
      title: "Uneven pacing",
      text: `The last interval (${s.lastSpeedKmh} km/h) was faster than the first (${s.firstSpeedKmh} km/h). Keep them even.`,
      evidence: [`First ${s.firstSpeedKmh} km/h`, `Last ${s.lastSpeedKmh} km/h`],
    });
  } else if (out.length < 4 && s.avgCadence != null) {
    const c = s.avgCadence;
    const inBand = c >= t.cadenceMin && c <= t.cadenceMax;
    out.push({
      id: id("cadence"),
      severity: inBand ? "good" : "info",
      title: "Cadence",
      text: inBand
        ? `Cadence averaged ${c} steps/min, inside ${t.cadenceMin}–${t.cadenceMax}.`
        : c < t.cadenceMin
          ? `Cadence averaged ${c} steps/min. Try shorter, quicker steps towards ${t.cadenceMin}–${t.cadenceMax}; it's easier on the shins.`
          : `Cadence averaged ${c} steps/min, above ${t.cadenceMax}. Fine if it feels relaxed.`,
      evidence: [`Average ${c} spm`, `Target ${t.cadenceMin}–${t.cadenceMax} spm`],
    });
  }
  return out.slice(0, 4);
}

export function runPlanLabel(p: PlanConfig["runPlan"][number]): string {
  return `${p.reps} × ${fmtMmSs(p.runS)} run / ${fmtMmSs(p.walkS)} walk`;
}
