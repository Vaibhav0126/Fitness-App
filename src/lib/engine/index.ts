import { fmtDay, localDate, localParts } from "./dates";
import type { PlanConfig } from "./config";
import { resolveMetrics, rolling, series } from "./metrics";
import { nextWorkout, type NextWorkout, scheduleFor, tripOn } from "./next";
import { computeReadiness, type Readiness } from "./readiness";
import { analyzeRun, collectRuns, feedbackFor, planProgress, type PlannedRun, runSummary } from "./runs";
import {
  goalProgress,
  type GoalProgress,
  lastPerformance,
  liftTrend,
  type LiftTrend,
  sessionsByExercise,
} from "./strength";
import { volumeFlags, weeklyVolume, type WeekVolume } from "./volume";
import type { EngineStore, Insight, ReadinessLevel } from "./types";

export type * from "./types";
export type { NextWorkout } from "./next";
export type { Prescription } from "./strength";

export interface DashboardState {
  generatedAt: string;
  today: {
    date: string;
    label: string;
    hour: number;
    readiness: ReadinessLevel;
    readinessDetail: Readiness["signals"];
    insights: Insight[];
  };
  next: NextWorkout | null;
  plan: {
    week: number;
    complete: boolean;
    runsThisWeek: number;
    runsPerWeek: number;
    repeatPending: boolean;
    weeks: Array<PlanConfig["runPlan"][number] & { status: "done" | "current" | "upcoming" }>;
  };
  /** Recent runs, oldest first. planWeek 0 = before planStart. */
  runs: Array<PlannedRun & { insights: Insight[] }>;
  lifts: LiftTrend[];
  keyLifts: string[];
  goals: GoalProgress[];
  weekly: WeekVolume[];
  volumeInsights: Insight[];
  recovery: Record<"hrv" | "rhr" | "sleep" | "steps", Array<{ date: string; v: number; avg: number }>>;
}

const RECOVERY_DAYS = 90;
const NO_SESSION_HOUR = 10;

/**
 * Pure, deterministic coaching engine: the same (store, config, now) always gives
 * the same state. All calendar logic runs in `config.timeZone`.
 */
export function computeState(store: EngineStore, cfg: PlanConfig, now: Date): DashboardState {
  const tz = cfg.timeZone;
  const { date: today, hour } = localParts(now, tz);
  const metrics = resolveMetrics(store.metrics);
  const readiness = computeReadiness(metrics, today);
  const easy = readiness.level === "low";

  const runs = collectRuns(store.workouts, tz, now);
  const plan = planProgress(runs, store.feedback, cfg, today);
  const planned = new Map(plan.log.map((r) => [r.id, r]));
  const byExercise = sessionsByExercise(store.sets, tz, now);

  // ---- Today ----
  const insights: Insight[] = [];
  const trip = tripOn(today, cfg);
  if (trip)
    insights.push({
      id: "today.trip",
      severity: "info",
      title: `Travelling: ${trip.label}`,
      text: trip.note ?? "Hotel mode is on for these dates.",
      evidence: [`${trip.from} to ${trip.to}`],
    });

  const todaysRuns = plan.log.filter((r) => r.date === today);
  for (const r of todaysRuns) {
    insights.push(...analyzeRun(r, cfg));
    if (!r.feedback) {
      insights.push({
        id: `today.run.${r.id}.feedback`,
        severity: "warn",
        title: "Log your shins",
        text: "Rate shin and calf pain (0–10) for today's run. It decides whether you move up a week.",
        evidence: [`Shin limit ${cfg.progression.shinMax}/10`],
        action: { kind: "run-feedback", workoutId: r.id, date: r.date },
      });
    }
  }

  const todaysSessions = [...byExercise.entries()].flatMap(([ex, ss]) =>
    ss.filter((s) => s.date === today).map((s) => ({ ex, s })),
  );
  const strengthWorkoutToday = store.workouts.find(
    (w) => w.type === "strength" && Date.parse(w.start) <= now.getTime() && localDate(w.start, tz) === today,
  );
  if (todaysSessions.length) {
    const ups: string[] = [];
    const downs: string[] = [];
    for (const { ex, s } of todaysSessions) {
      const cur = lastPerformance([s]);
      const prev = lastPerformance(byExercise.get(ex), Date.parse(s.start));
      if (!cur?.bestE1rm || !prev?.bestE1rm) continue;
      const short = ex.replace(/ \(.*\)/, "");
      if (cur.bestE1rm > prev.bestE1rm) ups.push(`${short} ${cur.best.weightKg}×${cur.best.reps}`);
      else if (cur.bestE1rm < prev.bestE1rm) downs.push(short);
    }
    const title = todaysSessions[0]?.s.title ?? "Strength session";
    const nSets = todaysSessions.reduce((n, x) => n + x.s.sets.length, 0);
    let text = `${title}: ${todaysSessions.length} exercises, ${nSets} sets`;
    if (strengthWorkoutToday?.durationS) text += `, ${Math.round(strengthWorkoutToday.durationS / 60)} min`;
    text += ".";
    if (ups.length) text += ` Up from last time: ${ups.join(", ")}.`;
    if (downs.length) text += ` Lower than last time: ${downs.join(", ")}.`;
    insights.push({
      id: "today.strength",
      severity: ups.length ? "good" : "info",
      title: "Today's lifting",
      text,
      evidence: [...ups.map((u) => `Best e1RM up: ${u}`), ...downs.map((d) => `Best e1RM down: ${d}`)],
    });
  } else if (strengthWorkoutToday) {
    insights.push({
      id: "today.strength",
      severity: "info",
      title: "Today's lifting",
      text: `Strength session${strengthWorkoutToday.durationS ? `: ${Math.round(strengthWorkoutToday.durationS / 60)} min` : ""}. Import your sets to compare with last time.`,
      evidence: [`Source: ${strengthWorkoutToday.source}`],
    });
  }

  const sched = scheduleFor(today, cfg);
  const anyToday = todaysRuns.length > 0 || todaysSessions.length > 0 || strengthWorkoutToday != null;
  if (!anyToday && !trip) {
    if (sched.kind === "rest")
      insights.push({
        id: "today.rest",
        severity: "info",
        title: "Rest day",
        text: "Recovery is training too: an easy walk, calf stretches and a good night's sleep.",
        evidence: [],
      });
    else if (hour >= NO_SESSION_HOUR)
      insights.push({
        id: "today.none",
        severity: "info",
        title: "No session logged yet",
        text: `Scheduled today: ${sched.kind === "run" ? "run" : sched.kind === "strength+run" ? `${sched.routine} + run` : sched.routine}. If you trained, your next import will pick it up.`,
        evidence: [`Schedule for ${fmtDay(today)}`],
      });
  }

  const steps = series(metrics, "steps", today, 2).pop();
  if (steps)
    insights.push({
      id: "today.steps",
      severity: "info",
      title: "Steps",
      text: `${Math.round(steps.v).toLocaleString("en-US")} on ${fmtDay(steps.date)}.`,
      evidence: [],
    });
  insights.push(...readiness.insights);

  // ---- Next ----
  const next = nextWorkout({
    cfg,
    today,
    hour,
    plan,
    byExercise,
    exercises: store.exercises,
    easy,
    logged: {
      strength: todaysSessions.length > 0 || strengthWorkoutToday != null,
      run: todaysRuns.length > 0,
    },
  });

  // ---- History ----
  const lifts = [...byExercise.keys()]
    .sort()
    .map((ex) => liftTrend(ex, byExercise.get(ex)))
    .filter((l) => l.points.length > 0);
  const goals = cfg.goals.map((g) => goalProgress(g, byExercise.get(g.exercise)));
  const weekly = weeklyVolume(byExercise, runs, store.exercises);
  const recovery = {
    hrv: rolling(series(metrics, "hrv_sdnn_ms", today, RECOVERY_DAYS)),
    rhr: rolling(series(metrics, "resting_hr", today, RECOVERY_DAYS)),
    sleep: rolling(series(metrics, "sleep_hours", today, RECOVERY_DAYS)),
    steps: rolling(series(metrics, "steps", today, RECOVERY_DAYS)),
  };

  return {
    generatedAt: now.toISOString(),
    today: {
      date: today,
      label: fmtDay(today),
      hour,
      readiness: readiness.level,
      readinessDetail: readiness.signals,
      insights,
    },
    next,
    plan: {
      week: plan.week,
      complete: plan.complete,
      runsThisWeek: plan.count,
      runsPerWeek: cfg.progression.runsPerWeek,
      repeatPending: plan.repeatPending,
      weeks: cfg.runPlan.map((p) => ({
        ...p,
        status: plan.complete || p.week < plan.week ? "done" : p.week === plan.week ? "current" : "upcoming",
      })),
    },
    // All recent runs; runs before planStart get planWeek 0 ("before the plan").
    runs: runs
      .filter((r) => r.date <= today)
      .map(
        (r): PlannedRun =>
          planned.get(r.id) ?? {
            ...r,
            planWeek: 0,
            runInWeek: 0,
            feedback: feedbackFor(r, store.feedback),
            summary: runSummary(r),
          },
      )
      .slice(-50)
      .map((r) => ({ ...r, insights: r.planWeek ? analyzeRun(r, cfg) : [] })),
    lifts,
    keyLifts: cfg.keyLifts,
    goals,
    weekly,
    volumeInsights: volumeFlags(weekly, cfg, store.exercises, today),
    recovery,
  };
}
