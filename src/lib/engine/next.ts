import { addDays, fmtDay, fmtMmSs, weekday } from "./dates";
import type { DayKey, PlanConfig, SessionKind } from "./config";
import { type PlanProgress, runPlanLabel } from "./runs";
import { exerciseMeta, lastPerformance, prescribe, type Prescription, type Session } from "./strength";
import type { ExerciseMeta, Insight } from "./types";

export const NEXT_DAY_HOUR = 12;

export interface RunPrescription {
  week: number;
  complete: boolean;
  reps: number | null;
  runS: number | null;
  walkS: number | null;
  title: string;
  goal: string;
  runInWeek: number;
}

export interface NextWorkout {
  date: string;
  label: string;
  kind: Exclude<SessionKind, "rest">;
  title: string;
  goal: string;
  trip: { label: string; note?: string } | null;
  strength: { routine: string; hotel: boolean; exercises: Prescription[] } | null;
  run: RunPrescription | null;
  items: Insight[];
  easy: boolean;
}

export const tripOn = (date: string, cfg: PlanConfig) =>
  cfg.trips.find((t) => date >= t.from && date <= t.to) ?? null;

export const scheduleFor = (date: string, cfg: PlanConfig) => cfg.schedule[String(weekday(date)) as DayKey];

export interface LoggedToday {
  strength: boolean;
  run: boolean;
}

function isDone(kind: SessionKind, logged: LoggedToday): boolean {
  if (kind === "strength") return logged.strength;
  if (kind === "run") return logged.run;
  if (kind === "strength+run") return logged.strength && logged.run;
  return false;
}

/**
 * Today's session unless it's already logged or it's past noon; then the next
 * non-rest day. Trip dates swap the routine for `hotelRoutine`.
 */
export function nextWorkout(args: {
  cfg: PlanConfig;
  today: string;
  hour: number;
  logged: LoggedToday;
  plan: PlanProgress;
  byExercise: Map<string, Session[]>;
  exercises: Record<string, ExerciseMeta>;
  easy: boolean;
}): NextWorkout | null {
  const { cfg, today, hour, logged, plan, byExercise, exercises, easy } = args;
  let date = today;
  if (hour >= NEXT_DAY_HOUR || isDone(scheduleFor(today, cfg).kind, logged)) date = addDays(today, 1);
  for (let i = 0; i < 7 && scheduleFor(date, cfg).kind === "rest"; i++) date = addDays(date, 1);
  const day = scheduleFor(date, cfg);
  if (day.kind === "rest") return null; // every day is a rest day

  const trip = tripOn(date, cfg);
  const items: Insight[] = [];
  if (trip) {
    items.push({
      id: "next.trip",
      severity: "info",
      title: `Travelling: ${trip.label}`,
      text: trip.note ?? "Hotel mode: the routine below needs no gym.",
      evidence: [`Trip ${trip.from} to ${trip.to}`],
    });
  }

  let strength: NextWorkout["strength"] = null;
  if (day.kind === "strength" || day.kind === "strength+run") {
    const hotel = trip != null;
    const routineName = hotel ? "Hotel routine" : (day.routine ?? "");
    const items_ = hotel ? cfg.hotelRoutine : (cfg.routines[day.routine ?? ""] ?? []);
    const prescriptions = items_.map((item) =>
      prescribe(item, lastPerformance(byExercise.get(item[0])), {
        easy,
        meta: exerciseMeta(item[0], exercises),
        progression: cfg.progression,
      }),
    );
    strength = { routine: routineName, hotel, exercises: prescriptions };
  }

  let run: RunPrescription | null = null;
  if (day.kind === "run" || day.kind === "strength+run") {
    const p = cfg.runPlan[plan.week - 1];
    const runsPerWeek = cfg.progression.runsPerWeek;
    if (plan.complete || !p) {
      run = {
        week: plan.week,
        complete: true,
        reps: null,
        runS: null,
        walkS: null,
        runInWeek: plan.count + 1,
        title: "Run: 20–25 min continuous at an easy pace",
        goal: "Plan complete. Build continuous running by about 5 minutes a week.",
      };
    } else {
      run = {
        week: plan.week,
        complete: false,
        reps: p.reps,
        runS: p.runS,
        walkS: p.walkS,
        runInWeek: plan.count + 1,
        title: `Run: Week ${plan.week} (${runPlanLabel(p)})`,
        goal: `Run ${plan.count + 1} of ${runsPerWeek} this week.${p.note ? ` ${p.note}.` : ""}`,
      };
    }
    const t = cfg.runTargets;
    items.push({
      id: "next.run.targets",
      severity: "info",
      title: "Pace and heart rate",
      text: `Run intervals at ${t.speedKmhMin}–${t.speedKmhMax} km/h, heart rate under ${t.hrCap} bpm, cadence ${t.cadenceMin}–${t.cadenceMax} steps/min. Last interval no faster than the first.`,
      evidence: ["From your run targets"],
    });
    const last = plan.log[plan.log.length - 1];
    if (last && !last.feedback) {
      items.push({
        id: "next.run.feedback",
        severity: "warn",
        title: "Shin check",
        text: `You haven't logged shin pain for your ${fmtDay(last.date)} run. If it was above ${cfg.progression.shinMax}/10, this week will be repeated.`,
        evidence: [`Run on ${last.date}`],
        action: { kind: "run-feedback", workoutId: last.id, date: last.date },
      });
    }
    if (plan.repeatPending) {
      items.push({
        id: "next.run.repeat",
        severity: "warn",
        title: "Repeating this week",
        text: `Shin pain was above ${cfg.progression.shinMax}/10 on a run this week, so Week ${plan.week} will be repeated before moving up.`,
        evidence: [`Shin limit ${cfg.progression.shinMax}/10`],
      });
    }
    const lastRepeat = plan.repeats[plan.repeats.length - 1];
    if (!plan.repeatPending && lastRepeat && lastRepeat.week === plan.week) {
      items.push({
        id: "next.run.repeated",
        severity: "info",
        title: `Week ${plan.week} again`,
        text: `You're repeating Week ${plan.week} because shin pain hit ${lastRepeat.shinPain}/10 on ${fmtDay(lastRepeat.date)}.`,
        evidence: [`Shin ${lastRepeat.shinPain}/10 > limit ${cfg.progression.shinMax}`],
      });
    }
    if (easy) {
      const prev = cfg.runPlan[plan.week - 2];
      items.push({
        id: "next.run.easy",
        severity: "warn",
        title: "Recovery is low",
        text: prev
          ? `Walk the whole session, or do Week ${prev.week}'s intervals (${prev.reps} × ${fmtMmSs(prev.runS)} / ${fmtMmSs(prev.walkS)}).`
          : "Walk the whole session, or keep the run intervals very easy.",
        evidence: ["Readiness is low"],
      });
    }
    items.push({
      id: "next.run.after",
      severity: "info",
      title: "After the run",
      text: "Calf stretches (knee straight, then bent). Log shin and calf pain here.",
      evidence: [],
    });
  }

  const kind = day.kind;
  const title =
    kind === "strength+run"
      ? `${strength?.routine ?? "Strength"} + run`
      : kind === "strength"
        ? (strength?.routine ?? "Strength")
        : (run?.title ?? "Run");
  const goal = strength
    ? easy
      ? "Recovery is low: same weights, one set fewer, stop 2 reps short of failure."
      : "Beat last time by one rep or one weight step on each lift."
    : (run?.goal ?? "");

  return {
    date,
    label: fmtDay(date),
    kind,
    title,
    goal,
    trip: trip ? { label: trip.label, ...(trip.note ? { note: trip.note } : {}) } : null,
    strength,
    run,
    items,
    easy,
  };
}
