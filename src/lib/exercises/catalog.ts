/**
 * Canonical exercise catalog: seeded into `exercise_alias` (global rows) by `pnpm db:seed`.
 * Names follow Hevy's "Exercise (Equipment)" convention; Strong uses the same style.
 * `aliases` are extra raw spellings that map to the canonical name.
 */

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "shins"
  | "core";

export interface CatalogEntry {
  name: string;
  muscleGroup: MuscleGroup;
  isDumbbell?: boolean;
  isBodyweight?: boolean;
  aliases?: string[];
}

export const EXERCISE_CATALOG: CatalogEntry[] = [
  // Template: Lower A / Lower B
  {
    name: "Squat (Barbell)",
    muscleGroup: "quads",
    aliases: ["Back Squat", "Barbell Squat", "Back Squat (Barbell)"],
  },
  { name: "Leg Press (Machine)", muscleGroup: "quads", aliases: ["Leg Press"] },
  { name: "Seated Leg Curl (Machine)", muscleGroup: "hamstrings", aliases: ["Seated Leg Curl"] },
  { name: "Lying Leg Curl (Machine)", muscleGroup: "hamstrings", aliases: ["Lying Leg Curl"] },
  { name: "Leg Extension (Machine)", muscleGroup: "quads", aliases: ["Leg Extension"] },
  { name: "Standing Calf Raise (Barbell)", muscleGroup: "calves" },
  { name: "Standing Calf Raise (Machine)", muscleGroup: "calves", aliases: ["Standing Calf Raise"] },
  { name: "Tibialis Raise", muscleGroup: "shins", aliases: ["Tib Raise", "Tibialis Raise (Plate)"] },
  { name: "Tibialis Raise (Wall)", muscleGroup: "shins", isBodyweight: true },
  { name: "Seated Calf Raise", muscleGroup: "calves", aliases: ["Seated Calf Raise (Machine)"] },
  { name: "Romanian Deadlift (Smith Machine)", muscleGroup: "hamstrings" },
  { name: "Romanian Deadlift (Barbell)", muscleGroup: "hamstrings", aliases: ["Romanian Deadlift", "RDL"] },
  { name: "Romanian Deadlift (Dumbbell)", muscleGroup: "hamstrings", isDumbbell: true },
  { name: "Deadlift (Barbell)", muscleGroup: "back", aliases: ["Deadlift", "Conventional Deadlift"] },
  { name: "Bulgarian Split Squat (Dumbbell)", muscleGroup: "quads", isDumbbell: true },
  {
    name: "Bulgarian Split Squat (Bodyweight)",
    muscleGroup: "quads",
    isBodyweight: true,
    aliases: ["Bulgarian Split Squat"],
  },
  { name: "Calf Press (Machine)", muscleGroup: "calves", aliases: ["Calf Press on Leg Press", "Calf Press"] },
  { name: "Single Leg Calf Raise", muscleGroup: "calves", isBodyweight: true },
  { name: "Hip Thrust (Barbell)", muscleGroup: "glutes", aliases: ["Hip Thrust"] },
  { name: "Lunge (Dumbbell)", muscleGroup: "quads", isDumbbell: true, aliases: ["Dumbbell Lunge"] },
  { name: "Goblet Squat", muscleGroup: "quads", isDumbbell: true },

  // Template: Upper A / Upper B
  {
    name: "Bench Press (Barbell)",
    muscleGroup: "chest",
    aliases: ["Bench Press", "Barbell Bench Press", "Flat Bench Press"],
  },
  {
    name: "Bench Press (Dumbbell)",
    muscleGroup: "chest",
    isDumbbell: true,
    aliases: ["Dumbbell Bench Press"],
  },
  {
    name: "Incline Bench Press (Dumbbell)",
    muscleGroup: "chest",
    isDumbbell: true,
    aliases: ["Incline Dumbbell Press"],
  },
  { name: "Incline Bench Press (Barbell)", muscleGroup: "chest" },
  { name: "Pull Up (Weighted)", muscleGroup: "back", aliases: ["Weighted Pull Up", "Weighted Pull-Up"] },
  { name: "Pull Up", muscleGroup: "back", isBodyweight: true, aliases: ["Pull-Up", "Pullup"] },
  { name: "Chin Up", muscleGroup: "back", isBodyweight: true, aliases: ["Chin-Up"] },
  {
    name: "Shoulder Press (Dumbbell)",
    muscleGroup: "shoulders",
    isDumbbell: true,
    aliases: ["Seated Dumbbell Press", "Dumbbell Shoulder Press"],
  },
  {
    name: "Overhead Press (Barbell)",
    muscleGroup: "shoulders",
    aliases: ["Overhead Press", "OHP", "Strict Press"],
  },
  {
    name: "Seated Cable Row - V Grip (Cable)",
    muscleGroup: "back",
    aliases: ["Seated Cable Row", "Seated Row (Cable)"],
  },
  { name: "Bent Over Row (Barbell)", muscleGroup: "back", aliases: ["Barbell Row", "Bent Over Row"] },
  {
    name: "Lateral Raise (Dumbbell)",
    muscleGroup: "shoulders",
    isDumbbell: true,
    aliases: ["Lateral Raise", "Side Lateral Raise"],
  },
  { name: "Lateral Raise (Cable)", muscleGroup: "shoulders" },
  {
    name: "Triceps Rope Pushdown",
    muscleGroup: "triceps",
    aliases: ["Tricep Rope Pushdown", "Triceps Pushdown (Cable)", "Rope Pushdown"],
  },
  {
    name: "Seated Incline Curl (Dumbbell)",
    muscleGroup: "biceps",
    isDumbbell: true,
    aliases: ["Incline Dumbbell Curl"],
  },
  {
    name: "Bicep Curl (Dumbbell)",
    muscleGroup: "biceps",
    isDumbbell: true,
    aliases: ["Dumbbell Curl", "Biceps Curl (Dumbbell)"],
  },
  { name: "Bicep Curl (Barbell)", muscleGroup: "biceps", aliases: ["Barbell Curl"] },
  { name: "Hammer Curl (Dumbbell)", muscleGroup: "biceps", isDumbbell: true, aliases: ["Hammer Curl"] },
  { name: "Cable Crunch", muscleGroup: "core", aliases: ["Kneeling Cable Crunch"] },
  { name: "Lat Pulldown (Cable)", muscleGroup: "back", aliases: ["Lat Pulldown", "Lat Pulldown (Machine)"] },
  {
    name: "Chest Supported Incline Row (Dumbbell)",
    muscleGroup: "back",
    isDumbbell: true,
    aliases: ["Chest Supported Row (Dumbbell)"],
  },
  { name: "Cable Fly Crossovers", muscleGroup: "chest", aliases: ["Cable Crossover", "Cable Fly"] },
  { name: "Chest Fly (Machine)", muscleGroup: "chest", aliases: ["Pec Deck", "Butterfly"] },
  {
    name: "Rear Delt Reverse Fly (Machine)",
    muscleGroup: "shoulders",
    aliases: ["Reverse Fly (Machine)", "Rear Delt Fly"],
  },
  { name: "Face Pull (Cable)", muscleGroup: "shoulders", aliases: ["Face Pull"] },
  {
    name: "Overhead Triceps Extension (Cable)",
    muscleGroup: "triceps",
    aliases: ["Overhead Tricep Extension (Cable)"],
  },
  { name: "Skullcrusher (Barbell)", muscleGroup: "triceps", aliases: ["Skull Crusher"] },
  {
    name: "Preacher Curl (Barbell)",
    muscleGroup: "biceps",
    aliases: ["EZ Bar Preacher Curl", "Preacher Curl"],
  },
  { name: "Hanging Leg Raise", muscleGroup: "core", isBodyweight: true },
  { name: "Plank", muscleGroup: "core", isBodyweight: true },
  { name: "Push Up", muscleGroup: "chest", isBodyweight: true, aliases: ["Push-Up", "Pushup"] },
  { name: "Dip", muscleGroup: "triceps", isBodyweight: true, aliases: ["Dips", "Chest Dip", "Triceps Dip"] },
];

/** Lower-cased, whitespace-collapsed lookup key. */
export const aliasKey = (raw: string): string =>
  raw.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** All (rawKey → canonical) pairs from the catalog, including each canonical name itself. */
export function catalogAliasRows(): Array<{
  rawKey: string;
  canonical: string;
  muscleGroup: MuscleGroup;
  isDumbbell: boolean;
  isBodyweight: boolean;
}> {
  const rows = new Map<string, ReturnType<typeof catalogAliasRows>[number]>();
  for (const e of EXERCISE_CATALOG) {
    for (const raw of [e.name, ...(e.aliases ?? [])]) {
      const key = aliasKey(raw);
      if (rows.has(key)) throw new Error(`duplicate exercise alias: ${raw}`);
      rows.set(key, {
        rawKey: key,
        canonical: e.name,
        muscleGroup: e.muscleGroup,
        isDumbbell: e.isDumbbell ?? false,
        isBodyweight: e.isBodyweight ?? false,
      });
    }
  }
  return [...rows.values()];
}
