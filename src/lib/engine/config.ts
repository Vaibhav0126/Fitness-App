import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().refine(isValidTimeZone, "unknown IANA time zone");

export const sessionKindSchema = z.enum(["strength", "run", "strength+run", "rest"]);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const scheduleDaySchema = z.object({
  kind: sessionKindSchema,
  routine: z.string().min(1).optional(),
});

/** [exercise, sets, repLo, repHi] */
export const routineItemSchema = z
  .tuple([
    z.string().min(1),
    z.number().int().min(1).max(10),
    z.number().int().min(1),
    z.number().int().min(1),
  ])
  .refine(([, , lo, hi]) => lo <= hi, "repLo must be ≤ repHi");
export type RoutineItem = z.infer<typeof routineItemSchema>;

const dayKeys = ["0", "1", "2", "3", "4", "5", "6"] as const;
export type DayKey = (typeof dayKeys)[number];

export const planConfigSchema = z
  .object({
    timeZone: timeZoneSchema,
    planStart: isoDate,
    /** 0 = Sunday … 6 = Saturday */
    schedule: z.object({
      "0": scheduleDaySchema,
      "1": scheduleDaySchema,
      "2": scheduleDaySchema,
      "3": scheduleDaySchema,
      "4": scheduleDaySchema,
      "5": scheduleDaySchema,
      "6": scheduleDaySchema,
    }),
    routines: z.record(z.string().min(1), z.array(routineItemSchema).min(1)),
    hotelRoutine: z.array(routineItemSchema),
    trips: z.array(
      z
        .object({ from: isoDate, to: isoDate, label: z.string().min(1), note: z.string().optional() })
        .refine((t) => t.from <= t.to, "trip `from` must be on or before `to`"),
    ),
    runPlan: z
      .array(
        z.object({
          week: z.number().int().min(1),
          reps: z.number().int().min(1),
          runS: z.number().int().min(1),
          walkS: z.number().int().min(0),
          note: z.string().optional(),
        }),
      )
      .min(1),
    runTargets: z
      .object({
        speedKmhMin: z.number().positive(),
        speedKmhMax: z.number().positive(),
        hrCap: z.number().int().positive(),
        cadenceMin: z.number().positive(),
        cadenceMax: z.number().positive(),
      })
      .refine((r) => r.speedKmhMin <= r.speedKmhMax && r.cadenceMin <= r.cadenceMax, "min must be ≤ max"),
    progression: z.object({
      weightStepKg: z.number().positive().default(2.5),
      dumbbellStepKg: z.number().positive().default(2),
      shinMax: z.number().min(0).max(10).default(3),
      runsPerWeek: z.number().int().min(1).max(7).default(2),
    }),
    /** Run-walk interval classification for imported runs: run if speed > walkSpeedKmh + marginKmh. */
    runClassification: z
      .object({ walkSpeedKmh: z.number().positive(), marginKmh: z.number().min(0) })
      .default({ walkSpeedKmh: 5.5, marginKmh: 1 }),
    keyLifts: z.array(z.string().min(1)),
    goals: z.array(
      z.object({
        exercise: z.string().min(1),
        weightKg: z.number().min(0).optional(),
        reps: z.number().int().min(1),
      }),
    ),
  })
  .superRefine((cfg, ctx) => {
    for (const key of dayKeys) {
      const day = cfg.schedule[key];
      const needsRoutine = day.kind === "strength" || day.kind === "strength+run";
      if (needsRoutine && !day.routine) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", key, "routine"],
          message: "a routine is required",
        });
      }
      if (day.routine && !cfg.routines[day.routine]) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", key, "routine"],
          message: `unknown routine "${day.routine}"`,
        });
      }
    }
    cfg.runPlan.forEach((w, i) => {
      if (w.week !== i + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["runPlan", i, "week"],
          message: "weeks must be numbered 1, 2, 3…",
        });
      }
    });
  });

export type PlanConfig = z.infer<typeof planConfigSchema>;
export type PlanConfigInput = z.input<typeof planConfigSchema>;

const mmss = (s: string): number => {
  const [m, sec] = s.split(":").map(Number);
  return (m ?? 0) * 60 + (sec ?? 0);
};

/** Template for new users: "Upper/Lower 4-day + 8-week run-walk" (spec §10). */
export function defaultPlanConfig(opts: { timeZone: string; planStart: string }): PlanConfig {
  const cfg: PlanConfigInput = {
    timeZone: opts.timeZone,
    planStart: opts.planStart,
    schedule: {
      "0": { kind: "rest" },
      "1": { kind: "strength", routine: "Lower A" },
      "2": { kind: "strength", routine: "Upper A" },
      "3": { kind: "run" },
      "4": { kind: "strength", routine: "Lower B" },
      "5": { kind: "strength", routine: "Upper B" },
      "6": { kind: "run" },
    },
    routines: {
      "Lower A": [
        ["Squat (Barbell)", 3, 5, 8],
        ["Leg Press (Machine)", 2, 10, 12],
        ["Seated Leg Curl (Machine)", 2, 12, 15],
        ["Leg Extension (Machine)", 2, 12, 15],
        ["Standing Calf Raise (Barbell)", 2, 12, 16],
        ["Tibialis Raise", 3, 15, 25],
        ["Seated Calf Raise", 3, 15, 20],
      ],
      "Upper A": [
        ["Bench Press (Barbell)", 3, 5, 8],
        ["Pull Up (Weighted)", 3, 6, 10],
        ["Shoulder Press (Dumbbell)", 2, 8, 12],
        ["Seated Cable Row - V Grip (Cable)", 2, 10, 12],
        ["Lateral Raise (Dumbbell)", 2, 15, 20],
        ["Triceps Rope Pushdown", 2, 12, 15],
        ["Seated Incline Curl (Dumbbell)", 2, 12, 15],
        ["Cable Crunch", 3, 15, 20],
      ],
      "Lower B": [
        ["Romanian Deadlift (Smith Machine)", 3, 8, 10],
        ["Bulgarian Split Squat (Dumbbell)", 2, 8, 10],
        ["Seated Leg Curl (Machine)", 2, 10, 12],
        ["Leg Extension (Machine)", 2, 12, 15],
        ["Calf Press (Machine)", 2, 15, 20],
        ["Tibialis Raise", 3, 15, 25],
        ["Seated Calf Raise", 3, 15, 20],
      ],
      "Upper B": [
        ["Incline Bench Press (Dumbbell)", 3, 8, 12],
        ["Lat Pulldown (Cable)", 3, 8, 10],
        ["Chest Supported Incline Row (Dumbbell)", 2, 10, 12],
        ["Cable Fly Crossovers", 2, 12, 15],
        ["Rear Delt Reverse Fly (Machine)", 2, 12, 15],
        ["Overhead Triceps Extension (Cable)", 2, 12, 15],
        ["Preacher Curl (Barbell)", 2, 10, 12],
        ["Hanging Leg Raise", 3, 15, 20],
      ],
    },
    hotelRoutine: [
      ["Tibialis Raise (Wall)", 3, 20, 25],
      ["Single Leg Calf Raise", 3, 12, 15],
      ["Bulgarian Split Squat (Bodyweight)", 3, 10, 12],
      ["Push Up", 3, 10, 20],
    ],
    trips: [],
    runPlan: [
      { week: 1, reps: 8, runS: mmss("1:00"), walkS: mmss("2:00") },
      { week: 2, reps: 8, runS: mmss("1:30"), walkS: mmss("2:00") },
      { week: 3, reps: 6, runS: mmss("2:00"), walkS: mmss("1:30") },
      { week: 4, reps: 6, runS: mmss("2:00"), walkS: mmss("2:00"), note: "Easier week" },
      { week: 5, reps: 5, runS: mmss("3:00"), walkS: mmss("1:30") },
      { week: 6, reps: 4, runS: mmss("4:00"), walkS: mmss("1:00") },
      { week: 7, reps: 3, runS: mmss("7:00"), walkS: mmss("1:00") },
      { week: 8, reps: 2, runS: mmss("10:00"), walkS: mmss("1:00"), note: "Then try 20 min continuous" },
    ],
    runTargets: { speedKmhMin: 7.5, speedKmhMax: 8.5, hrCap: 150, cadenceMin: 165, cadenceMax: 175 },
    progression: { weightStepKg: 2.5, dumbbellStepKg: 2, shinMax: 3, runsPerWeek: 2 },
    keyLifts: [
      "Squat (Barbell)",
      "Bench Press (Barbell)",
      "Romanian Deadlift (Smith Machine)",
      "Pull Up (Weighted)",
      "Incline Bench Press (Dumbbell)",
      "Shoulder Press (Dumbbell)",
    ],
    goals: [
      { exercise: "Squat (Barbell)", weightKg: 120, reps: 5 },
      { exercise: "Bench Press (Barbell)", weightKg: 85, reps: 5 },
      { exercise: "Pull Up (Weighted)", weightKg: 30, reps: 10 },
      { exercise: "Tibialis Raise", weightKg: 20, reps: 25 },
    ],
  };
  return planConfigSchema.parse(cfg);
}

/** A minimal "start from scratch" config: rest every day, one empty-ish routine to edit. */
export function emptyPlanConfig(opts: { timeZone: string; planStart: string }): PlanConfig {
  const base = defaultPlanConfig(opts);
  return planConfigSchema.parse({
    ...base,
    schedule: Object.fromEntries(dayKeys.map((k) => [k, { kind: "rest" }])),
    routines: { "My routine": [["Squat (Barbell)", 3, 5, 8]] },
    trips: [],
    keyLifts: [],
    goals: [],
  });
}
