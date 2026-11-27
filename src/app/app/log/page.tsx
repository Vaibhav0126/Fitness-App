import type { Metadata } from "next";
import { RunLogger } from "@/components/log/run-logger";
import { StrengthLogger } from "@/components/log/strength-logger";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { localParts } from "@/lib/engine/dates";
import { EXERCISE_CATALOG } from "@/lib/exercises/catalog";
import { getDashboardBundle } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Log" };

export default async function LogPage() {
  const user = await requireUser();
  const { state, settings } = await getDashboardBundle(user.id);
  const { date, hour, minute } = localParts(new Date(), settings.timeZone);
  const nowLocal = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const exercises = [
    ...new Set([...state.lifts.map((l) => l.exercise), ...EXERCISE_CATALOG.map((e) => e.name)]),
  ].sort();
  const next = state.next?.strength;
  const suggestion = next
    ? {
        title: next.routine,
        rows: next.exercises.flatMap((p) =>
          Array.from({ length: p.sets }, () => ({
            exercise: p.exercise,
            weightKg: p.weightKg,
            reps: p.targetReps ?? p.repLo,
          })),
        ),
      }
    : null;
  const readOnly = Boolean(user.isDemo);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">Log</h1>
        <p className="text-muted-foreground">For sessions you didn&apos;t track in an app.</p>
      </header>
      <Card className="grid gap-4">
        <div>
          <CardTitle>Strength session</CardTitle>
          {suggestion ? (
            <CardDescription>
              Prefilled with your next workout ({suggestion.title}). Edit what you actually did.
            </CardDescription>
          ) : null}
        </div>
        <StrengthLogger
          nowLocal={nowLocal}
          exercises={exercises}
          suggestion={suggestion}
          readOnly={readOnly}
        />
      </Card>
      <Card className="grid gap-4">
        <CardTitle>Quick-add a run</CardTitle>
        <RunLogger nowLocal={nowLocal} shinMax={settings.config.progression.shinMax} readOnly={readOnly} />
      </Card>
    </div>
  );
}
