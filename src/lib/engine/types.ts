/** Engine input/output types. The engine is pure: no I/O, no clock, no globals. */

export type MetricName =
  | "sleep_hours"
  | "hrv_sdnn_ms"
  | "resting_hr"
  | "steps"
  | "active_energy_kcal"
  | "vo2max"
  | "weight_kg"
  | "walking_hr_avg";

export type WorkoutType = "run" | "walk" | "ride" | "strength" | "other";
export type IntervalKind = "warmup" | "run" | "walk" | "cooldown";

export interface MetricRow {
  date: string;
  name: MetricName;
  value: number;
  source: string;
}

export interface IntervalRow {
  idx: number;
  kind: IntervalKind;
  durationS?: number | null;
  distanceM?: number | null;
  avgSpeedKmh?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  cadence?: number | null;
}

export interface WorkoutRow {
  id: string;
  source: string;
  type: WorkoutType;
  /** ISO instant */
  start: string;
  durationS?: number | null;
  distanceM?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgCadence?: number | null;
  avgSpeedKmh?: number | null;
  name?: string | null;
  intervals: IntervalRow[];
}

export interface SetRow {
  /** ISO instant of the session start; sets are grouped into sessions by this value. */
  performedAt: string;
  sessionTitle?: string | null;
  exercise: string;
  setIndex: number;
  setType?: string | null;
  weightKg?: number | null;
  reps?: number | null;
}

export interface FeedbackRow {
  workoutId?: string | null;
  date: string;
  shinPain?: number | null;
  calfPain?: number | null;
  effort?: number | null;
}

export interface ExerciseMeta {
  muscleGroup?: string | null;
  isDumbbell?: boolean;
  isBodyweight?: boolean;
}

export interface EngineStore {
  metrics: MetricRow[];
  workouts: WorkoutRow[];
  sets: SetRow[];
  feedback: FeedbackRow[];
  /** Keyed by canonical exercise name. Missing entries fall back to name heuristics. */
  exercises: Record<string, ExerciseMeta>;
}

export type Severity = "info" | "good" | "warn";

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  /** The numbers behind the insight, shown under "why?" in the UI. */
  evidence: string[];
  action?: { kind: "run-feedback"; workoutId: string; date: string };
}

export type ReadinessLevel = "good" | "ok" | "low" | "unknown";
