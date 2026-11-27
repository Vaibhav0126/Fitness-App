import { addDays, fmtDay } from "./dates";
import { mean, type Point, series } from "./metrics";
import type { Insight, MetricName, ReadinessLevel } from "./types";

/*
 * Readiness (spec §6.2):
 *   - HRV ≤ −15% vs baseline, resting HR ≥ +5 bpm vs baseline, sleep < 6 h.
 *   - 0 flags = good, 1 = ok, 2+ = low.
 *   - Missing data → "unknown", never "low".
 * Details (see docs/engine.md):
 *   - "Current" value = latest entry dated today or yesterday (older counts as missing).
 *   - Baseline = mean of up to 7 entries before the current one within 30 days, minimum 3.
 *   - A signal is evaluable if it has a current value (and, for HRV/RHR, a baseline).
 *   - Level is good/ok only when all three signals are evaluable. With missing signals the
 *     level is "unknown" unless 2+ evaluable signals are already flagged ("low").
 */

export const READINESS_RULES = {
  hrvDropPct: -15,
  rhrRiseBpm: 5,
  sleepMinHours: 6,
  baselineEntries: 7,
  baselineMin: 3,
  lookbackDays: 30,
  maxStalenessDays: 1,
} as const;

type Signal = "hrv" | "rhr" | "sleep";

export interface SignalResult {
  signal: Signal;
  current: Point | null;
  baseline: number | null;
  /** HRV: % change; RHR: bpm difference; sleep: hours below threshold (unused) */
  delta: number | null;
  flagged: boolean;
  evaluable: boolean;
}

export interface Readiness {
  level: ReadinessLevel;
  flags: Signal[];
  signals: Record<Signal, SignalResult>;
  insights: Insight[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function current(points: Point[], today: string): Point | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return last.date >= addDays(today, -READINESS_RULES.maxStalenessDays) ? last : null;
}

function baseline(points: Point[], cur: Point): number | null {
  const prev = points
    .filter((p) => p.date < cur.date)
    .slice(-READINESS_RULES.baselineEntries)
    .map((p) => p.v);
  return prev.length >= READINESS_RULES.baselineMin ? mean(prev) : null;
}

export function computeReadiness(metrics: Map<MetricName, Map<string, number>>, today: string): Readiness {
  const pts = (n: MetricName) => series(metrics, n, today, READINESS_RULES.lookbackDays);
  const insights: Insight[] = [];

  // HRV
  const hrvPts = pts("hrv_sdnn_ms");
  const hrvCur = current(hrvPts, today);
  const hrvBase = hrvCur ? baseline(hrvPts, hrvCur) : null;
  const hrvPct = hrvCur && hrvBase ? Math.round(((hrvCur.v - hrvBase) / hrvBase) * 100) : null;
  const hrv: SignalResult = {
    signal: "hrv",
    current: hrvCur,
    baseline: hrvBase,
    delta: hrvPct,
    flagged: hrvPct != null && hrvPct <= READINESS_RULES.hrvDropPct,
    evaluable: hrvPct != null,
  };
  if (hrvCur) {
    insights.push({
      id: "readiness.hrv",
      severity: hrv.flagged ? "warn" : hrvPct != null && hrvPct >= 0 ? "good" : "info",
      title: "HRV",
      text:
        `${Math.round(hrvCur.v)} ms (${fmtDay(hrvCur.date)})` +
        (hrvPct == null || hrvBase == null
          ? ". Needs a few more nights for a baseline."
          : `, ${hrvPct >= 0 ? "+" : ""}${hrvPct}% vs your 7-day average of ${Math.round(hrvBase)} ms.`),
      evidence: [
        `Current: ${r1(hrvCur.v)} ms on ${hrvCur.date}`,
        hrvBase == null ? "Baseline: fewer than 3 earlier nights" : `Baseline: ${r1(hrvBase)} ms`,
        `Flag when ≤ ${READINESS_RULES.hrvDropPct}%`,
      ],
    });
  }

  // Resting HR
  const rhrPts = pts("resting_hr");
  const rhrCur = current(rhrPts, today);
  const rhrBase = rhrCur ? baseline(rhrPts, rhrCur) : null;
  const rhrDiff = rhrCur && rhrBase != null ? Math.round(rhrCur.v - rhrBase) : null;
  const rhr: SignalResult = {
    signal: "rhr",
    current: rhrCur,
    baseline: rhrBase,
    delta: rhrDiff,
    flagged: rhrDiff != null && rhrDiff >= READINESS_RULES.rhrRiseBpm,
    evaluable: rhrDiff != null,
  };
  if (rhrCur) {
    insights.push({
      id: "readiness.rhr",
      severity: rhr.flagged ? "warn" : "info",
      title: "Resting heart rate",
      text:
        `${Math.round(rhrCur.v)} bpm` +
        (rhrDiff == null
          ? ". Needs a few more days for a baseline."
          : `, ${rhrDiff >= 0 ? "+" : ""}${rhrDiff} vs your 7-day average.`),
      evidence: [
        `Current: ${r1(rhrCur.v)} bpm on ${rhrCur.date}`,
        rhrBase == null ? "Baseline: fewer than 3 earlier days" : `Baseline: ${r1(rhrBase)} bpm`,
        `Flag when ≥ +${READINESS_RULES.rhrRiseBpm} bpm`,
      ],
    });
  }

  // Sleep
  const sleepPts = pts("sleep_hours");
  const sleepCur = current(sleepPts, today);
  const sleepBase = sleepCur ? baseline(sleepPts, sleepCur) : null;
  const sleep: SignalResult = {
    signal: "sleep",
    current: sleepCur,
    baseline: sleepBase,
    delta: null,
    flagged: sleepCur != null && sleepCur.v < READINESS_RULES.sleepMinHours,
    evaluable: sleepCur != null,
  };
  if (sleepCur) {
    insights.push({
      id: "readiness.sleep",
      severity: sleep.flagged ? "warn" : "info",
      title: "Sleep",
      text:
        `${r1(sleepCur.v)} h last night` +
        (sleepBase != null ? ` (average ${r1(sleepBase)} h).` : ".") +
        (sleep.flagged ? " A short night, so keep the next session easier." : ""),
      evidence: [
        `Slept ${r1(sleepCur.v)} h (night ending ${sleepCur.date})`,
        `Flag when < ${READINESS_RULES.sleepMinHours} h`,
      ],
    });
  }

  const signals = { hrv, rhr, sleep };
  const all = [hrv, rhr, sleep];
  const flags = all.filter((s) => s.flagged).map((s) => s.signal);
  const allEvaluable = all.every((s) => s.evaluable);
  let level: ReadinessLevel;
  if (flags.length >= 2) level = "low";
  else if (!allEvaluable) level = "unknown";
  else level = flags.length === 1 ? "ok" : "good";

  if (level === "low") {
    insights.push({
      id: "readiness.low",
      severity: "warn",
      title: "Recovery flag",
      text: "Two or more recovery signals are down (HRV, resting HR or sleep). Your next session is adjusted to be easier.",
      evidence: flags.map((f) => `Flagged: ${f}`),
    });
  } else if (level === "unknown") {
    const missing = all.filter((s) => !s.evaluable).map((s) => s.signal);
    insights.push({
      id: "readiness.unknown",
      severity: "info",
      title: "Readiness unknown",
      text: "Not enough recent data to judge recovery. Sync HRV, resting heart rate and sleep to get a readiness score.",
      evidence: missing.map((m) => `Missing or no baseline: ${m}`),
    });
  }

  return { level, flags, signals, insights };
}
