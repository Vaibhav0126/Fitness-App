import type { NextWorkout } from "@/lib/engine";
import { cn } from "@/lib/utils";

const ACTION: Record<string, { label: string; cls: string }> = {
  increase: { label: "Add weight", cls: "text-good" },
  "add-load": { label: "Add load", cls: "text-good" },
  reps: { label: "Add reps", cls: "text-foreground" },
  repeat: { label: "Repeat", cls: "text-muted-foreground" },
  easy: { label: "Easy", cls: "text-warn" },
  "find-weight": { label: "New", cls: "text-muted-foreground" },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function StrengthList({
  exercises,
  detailed,
}: {
  exercises: NonNullable<NextWorkout["strength"]>["exercises"];
  detailed?: boolean;
}) {
  return (
    <ol className="divide-y">
      {exercises.map((e) => {
        const a = ACTION[e.action] ?? ACTION.repeat!;
        return (
          <li key={e.exercise} className="grid gap-0.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{e.exercise}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums">{e.target}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {e.last
                  ? `Last ${e.last.sets.map((s) => (s.weightKg ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join(", ")}`
                  : "No history yet"}
              </span>
              <span className={cn("shrink-0 font-medium", a.cls)}>{a.label}</span>
            </div>
            {detailed && e.note ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RunBlock({ run }: { run: NonNullable<NextWorkout["run"]> }) {
  return (
    <div className="grid gap-1">
      <p className="font-medium">{run.title}</p>
      {run.reps && run.runS ? (
        <p className="font-mono text-sm tabular-nums">
          {run.reps} × ({mmss(run.runS)} run{run.walkS ? ` / ${mmss(run.walkS)} walk` : ""})
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{run.goal}</p>
    </div>
  );
}
