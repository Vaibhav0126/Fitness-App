import { addDays, isoWeekStart, localDate, weekday } from "../engine/dates";
import { defaultPlanConfig, type PlanConfig, type RoutineItem } from "../engine/config";
import type { NormalizedMetric, NormalizedSet, NormalizedWorkout } from "../importers/adapter";
import { zonedToUtc } from "../parsers/tz";
import { DEMO_TIME_ZONE } from "./constants";

/*
 * Synthetic demo data (spec §10), deterministic for a given anchor date:
 *   - 12 weeks of 4-day upper/lower lifting with realistic progression
 *   - 2 run-walk sessions per week following the plan (started 6 weeks ago)
 *   - daily metrics with noise, one bad-recovery week, one trip (hotel routine)
 * Everything is generated relative to "today" so the demo never looks stale.
 */

export interface DemoFeedback {
  workoutExternalId: string;
  date: string;
  shinPain: number;
  calfPain: number;
  effort: number;
}

export interface DemoData {
  config: PlanConfig;
  metrics: NormalizedMetric[];
  workouts: NormalizedWorkout[];
  sets: NormalizedSet[];
  feedback: DemoFeedback[];
}

/** mulberry32: small, fast, deterministic PRNG */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** approx. normal via sum of uniforms */
    normal: (mean: number, sd: number) => mean + sd * (next() + next() + next() + next() - 2) * 1.2247,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
  };
}

const START_WEIGHTS: Record<string, number> = {
  "Squat (Barbell)": 80,
  "Leg Press (Machine)": 140,
  "Seated Leg Curl (Machine)": 40,
  "Leg Extension (Machine)": 45,
  "Standing Calf Raise (Barbell)": 50,
  "Tibialis Raise": 5,
  "Seated Calf Raise": 30,
  "Bench Press (Barbell)": 65,
  "Pull Up (Weighted)": 5,
  "Shoulder Press (Dumbbell)": 18,
  "Seated Cable Row - V Grip (Cable)": 50,
  "Lateral Raise (Dumbbell)": 8,
  "Triceps Rope Pushdown": 25,
  "Seated Incline Curl (Dumbbell)": 10,
  "Cable Crunch": 30,
  "Romanian Deadlift (Smith Machine)": 70,
  "Bulgarian Split Squat (Dumbbell)": 14,
  "Calf Press (Machine)": 100,
  "Incline Bench Press (Dumbbell)": 22,
  "Lat Pulldown (Cable)": 50,
  "Chest Supported Incline Row (Dumbbell)": 18,
  "Cable Fly Crossovers": 12.5,
  "Rear Delt Reverse Fly (Machine)": 30,
  "Overhead Triceps Extension (Cable)": 20,
  "Preacher Curl (Barbell)": 25,
  "Hanging Leg Raise": 0,
};

const COMPOUNDS = new Set([
  "Squat (Barbell)",
  "Bench Press (Barbell)",
  "Romanian Deadlift (Smith Machine)",
  "Incline Bench Press (Dumbbell)",
]);
const DUMBBELL = /dumbbell/i;

const at = (date: string, hh: number, mm: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return zonedToUtc({ year: y!, month: m!, day: d!, hour: hh, minute: mm }, DEMO_TIME_ZONE);
};
const round = (v: number, step: number) => Math.round(v / step) * step;

export function generateDemoData(now: Date): DemoData {
  const today = localDate(now, DEMO_TIME_ZONE);
  const r = rng(20261127);
  const firstMonday = addDays(isoWeekStart(today), -7 * 11); // 12 ISO weeks including this one
  const planStart = addDays(isoWeekStart(today), -7 * 5); // run plan started 6 weeks ago
  const badWeek = addDays(isoWeekStart(today), -7 * 4); // HRV down, RHR up, short sleep
  const tripFrom = addDays(isoWeekStart(today), -7 * 2);
  const tripTo = addDays(tripFrom, 4);

  const base = defaultPlanConfig({ timeZone: DEMO_TIME_ZONE, planStart });
  const config: PlanConfig = {
    ...base,
    trips: [
      {
        from: tripFrom,
        to: tripTo,
        label: "Conference in Lisbon",
        note: "Hotel gym only: bodyweight leg routine, keep both runs.",
      },
    ],
  };

  const metrics: NormalizedMetric[] = [];
  const workouts: NormalizedWorkout[] = [];
  const sets: NormalizedSet[] = [];
  const feedback: DemoFeedback[] = [];

  // ---- daily metrics ----
  let vo2 = 41.5;
  let weight = 81.2;
  for (let d = firstMonday; d <= today; d = addDays(d, 1)) {
    const bad = d >= badWeek && d < addDays(badWeek, 5);
    const hrv = bad ? r.normal(38, 3) : r.normal(52, 4.5);
    const rhr = bad ? r.normal(61.5, 1.2) : r.normal(55, 1.4);
    const sleep = bad ? r.normal(5.4, 0.3) : r.normal(7.3, 0.5);
    if (weekday(d) === 1) vo2 += 0.12;
    weight += r.normal(-0.02, 0.15);
    const push = (name: NormalizedMetric["name"], value: number, dp = 1) =>
      metrics.push({ kind: "metric", date: d, name, value: Math.round(value * 10 ** dp) / 10 ** dp });
    // Today's steps and energy aren't complete yet; still include sleep/HRV/RHR for today.
    push("hrv_sdnn_ms", hrv);
    push("resting_hr", rhr, 0);
    push("sleep_hours", Math.min(9.5, Math.max(4.2, sleep)), 2);
    if (d < today) {
      push("steps", Math.max(2500, r.normal(9400, 2300)), 0);
      push("active_energy_kcal", r.normal(620, 110), 0);
      push("walking_hr_avg", r.normal(102, 3), 0);
    }
    if (weekday(d) === 1) push("vo2max", vo2);
    if (r.next() < 0.4) push("weight_kg", weight);
  }

  // ---- strength (simulated progression using the plan's rules) ----
  const state = new Map<string, { weight: number; reps: number[] }>();
  const progress = (item: RoutineItem, easy: boolean) => {
    const [ex, nSets, lo, hi] = item;
    const st = state.get(ex) ?? {
      weight: START_WEIGHTS[ex] ?? 20,
      reps: Array.from({ length: nSets }, () => lo),
    };
    if (!easy && st.reps.every((x) => x >= hi)) {
      st.weight = round(st.weight + (DUMBBELL.test(ex) ? 2 : 2.5), DUMBBELL.test(ex) ? 1 : 0.5);
      st.reps = st.reps.map(() => lo);
    } else if (!easy) {
      const best = Math.max(...st.reps);
      st.reps = st.reps.map((x, i) =>
        Math.min(
          hi,
          Math.max(x, best + (i === 0 || r.next() < 0.6 ? 1 : 0) - (i > 1 && r.next() < 0.3 ? 1 : 0)),
        ),
      );
    } else {
      st.reps = st.reps.map((x) => Math.max(lo - 1, x - r.int(0, 1)));
    }
    state.set(ex, st);
    return st;
  };

  for (
    let d = firstMonday;
    d < today || (d === today && now.getTime() > at(today, 8, 15).getTime());
    d = addDays(d, 1)
  ) {
    const day = config.schedule[String(weekday(d)) as keyof PlanConfig["schedule"]];
    const onTrip = d >= tripFrom && d <= tripTo;
    if (day.kind !== "strength" && day.kind !== "strength+run") continue;
    if (r.next() < 0.06 && !onTrip) continue; // an occasional missed session
    const items = onTrip ? config.hotelRoutine : (config.routines[day.routine ?? ""] ?? []);
    const title = onTrip ? "Hotel routine" : (day.routine ?? "Strength");
    const start = at(d, 7, r.int(0, 20));
    const startIso = start.toISOString();
    const easy = d >= badWeek && d < addDays(badWeek, 5);
    let minutes = 0;
    for (const item of items) {
      const [ex, nSets] = item;
      const bw = onTrip || START_WEIGHTS[ex] === 0;
      const st = progress(item, easy);
      let idx = 0;
      const push = (weightKg: number | null, reps: number, setType = "normal") => {
        sets.push({
          kind: "set",
          externalId: `demo|${startIso}|${ex}|${idx}`,
          sessionTitle: title,
          performedAt: startIso,
          sessionEnd: null,
          exerciseRaw: ex,
          setIndex: idx++,
          setType,
          weightKg,
          reps,
          rpe: null,
        });
      };
      if (COMPOUNDS.has(ex) && !bw) push(round(st.weight * 0.5, 2.5), 8, "warmup");
      const n = easy ? Math.max(1, nSets - 1) : nSets;
      for (let i = 0; i < n; i++) push(bw ? null : st.weight, st.reps[i] ?? st.reps[0]!);
      minutes += n * 3 + 2;
    }
    const end = new Date(start.getTime() + minutes * 60_000).toISOString();
    // The importer creates one strength workout per session from these sets.
    for (const s of sets) if (s.performedAt === startIso) s.sessionEnd = end;
  }

  // ---- runs (run-walk plan from planStart; one shin flare repeats a week) ----
  let week = 1;
  let inWeek = 0;
  let repeatThisWeek = false;
  for (let d = planStart; d <= today; d = addDays(d, 1)) {
    const kind = config.schedule[String(weekday(d)) as keyof PlanConfig["schedule"]].kind;
    if (kind !== "run" && kind !== "strength+run") continue;
    const startAt = at(d, 6, r.int(20, 40));
    if (startAt.getTime() > now.getTime()) break;
    const p = config.runPlan[Math.min(week, config.runPlan.length) - 1]!;
    const intervals: NonNullable<NormalizedWorkout["intervals"]> = [];
    let t = startAt.getTime();
    const addIv = (
      k: "warmup" | "run" | "walk" | "cooldown",
      dur: number,
      speed: number,
      hr: number,
      cad: number,
    ) => {
      intervals.push({
        idx: intervals.length,
        kind: k,
        start: new Date(t).toISOString(),
        durationS: dur,
        distanceM: Math.round((speed / 3.6) * dur),
        avgSpeedKmh: Math.round(speed * 10) / 10,
        avgHr: Math.round(hr - 4),
        maxHr: Math.round(hr),
        cadence: Math.round(cad),
      });
      t += dur * 1000;
    };
    addIv("warmup", 300, r.normal(5.2, 0.2), r.normal(112, 3), r.normal(110, 3));
    const fatigue = d >= badWeek && d < addDays(badWeek, 7) ? 6 : 0;
    for (let i = 0; i < p.reps; i++) {
      addIv(
        "run",
        p.runS,
        r.normal(8.0 + i * 0.03, 0.2),
        r.normal(142 + i * 1.6 + fatigue, 2.5),
        r.normal(168, 2.5),
      );
      if (i < p.reps - 1) addIv("walk", p.walkS, r.normal(5.4, 0.2), r.normal(122, 3), r.normal(112, 3));
    }
    addIv("cooldown", 300, r.normal(4.9, 0.2), r.normal(115, 3), r.normal(108, 3));
    const durationS = Math.round((t - startAt.getTime()) / 1000);
    const distanceM = intervals.reduce((a, iv) => a + (iv.distanceM ?? 0), 0);
    const externalId = `demo-run|${startAt.toISOString()}`;
    workouts.push({
      kind: "workout",
      externalId,
      type: "run",
      name: "Outdoor Run",
      start: startAt.toISOString(),
      end: new Date(t).toISOString(),
      durationS,
      distanceM,
      avgHr: Math.round(
        intervals.reduce((a, iv) => a + (iv.avgHr ?? 0) * (iv.durationS ?? 0), 0) / durationS,
      ),
      maxHr: Math.max(...intervals.map((iv) => iv.maxHr ?? 0)),
      avgCadence: Math.round(intervals.reduce((a, iv) => a + (iv.cadence ?? 0), 0) / intervals.length),
      avgSpeedKmh: Math.round((distanceM / durationS) * 3.6 * 10) / 10,
      energyKcal: Math.round((durationS / 60) * 9.5),
      intervals,
    });
    // Shin flare on the second run of week 3 → week 3 repeats. Leave today's run unrated.
    const flare = week === 3 && inWeek === 1 && !repeatThisWeek && feedback.every((f) => f.shinPain <= 3);
    if (d < today) {
      feedback.push({
        workoutExternalId: externalId,
        date: d,
        shinPain: flare ? 5 : r.int(0, 2),
        calfPain: r.int(0, 3),
        effort: r.int(4, 7),
      });
    }
    inWeek++;
    if (flare) repeatThisWeek = true;
    if (inWeek >= config.progression.runsPerWeek) {
      if (!repeatThisWeek) week++;
      inWeek = 0;
      repeatThisWeek = false;
    }
  }

  return { config, metrics, workouts, sets, feedback };
}
