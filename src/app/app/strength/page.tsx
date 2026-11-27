import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { InsightCard } from "@/components/app/insight-card";
import { E1rmChart } from "@/components/charts/presets";
import { shortDate } from "@/lib/charts/format";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { e1rm } from "@/lib/engine/strength";
import { VOLUME_MAX_SETS, VOLUME_MIN_SETS } from "@/lib/engine/volume";
import { cn } from "@/lib/utils";
import { getDashboard } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Strength" };

const WEEKS = 8;

export default async function StrengthPage() {
  const user = await requireUser();
  const state = await getDashboard(user.id);
  const { lifts, goals, keyLifts, weekly, volumeInsights } = state;
  if (!lifts.length)
    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-bold">Strength</h1>
        <EmptyState
          title="No lifting history yet"
          text="Import your Hevy or Strong CSV, or log a session, to see estimated 1RM trends and weekly volume."
          secondary={{ href: "/app/log", label: "Log a session" }}
        />
      </div>
    );

  const keySet = new Set(keyLifts);
  const ordered = [
    ...lifts.filter((l) => keySet.has(l.exercise)),
    ...lifts.filter((l) => !keySet.has(l.exercise)),
  ];
  const goalFor = (ex: string) => goals.find((g) => g.exercise === ex);
  const weeks = weekly.slice(-WEEKS);
  const groups = [...new Set(weeks.flatMap((w) => Object.keys(w.groups)))].sort();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Strength</h1>

      {goals.length ? (
        <Card className="grid gap-3">
          <CardTitle>Goals</CardTitle>
          <ul className="grid gap-3">
            {goals.map((g) => (
              <li key={g.label} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{g.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {g.pct}% · best {g.best || "–"}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${g.label} progress`}
                  aria-valuenow={g.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 rounded-full bg-muted"
                >
                  <div
                    className="h-2 rounded-full bg-series-1"
                    style={{ width: `${Math.min(100, g.pct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="grid gap-3" aria-labelledby="lifts-h">
        <h2 id="lifts-h" className="font-semibold">
          Estimated 1RM
        </h2>
        <p className="text-sm text-muted-foreground">
          Best working set per session (Epley). Key lifts first.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.slice(0, 12).map((l) => {
            const g = goalFor(l.exercise);
            const goalE1rm = g?.method === "e1rm" && g.weightKg ? e1rm(g.weightKg, g.reps) : null;
            const last = l.points.at(-1)!;
            return (
              <Card key={l.exercise} className="grid gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {l.exercise}
                    {keySet.has(l.exercise) ? (
                      <span className="ml-1 text-xs text-muted-foreground">key</span>
                    ) : null}
                  </h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {last.top} on {shortDate(last.date)}
                  </span>
                </div>
                {l.points.length > 1 ? (
                  <E1rmChart title="e1RM (kg)" points={l.points} goalE1rm={goalE1rm} />
                ) : (
                  <p className="text-sm text-muted-foreground">One session so far: e1RM {last.e1rm} kg.</p>
                )}
              </Card>
            );
          })}
        </div>
        {ordered.length > 12 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {ordered.length - 12} more exercises
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {ordered.slice(12).map((l) => (
                <li key={l.exercise} className="flex justify-between gap-2">
                  <span>{l.exercise}</span>
                  <span className="text-muted-foreground tabular-nums">{l.points.at(-1)!.e1rm} kg</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <Card className="grid gap-3">
        <CardTitle>Weekly sets per muscle group</CardTitle>
        <CardDescription>
          Working sets per ISO week. {VOLUME_MIN_SETS}–{VOLUME_MAX_SETS} is the productive range.
        </CardDescription>
        {volumeInsights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="py-1 pr-2 font-medium">Group</th>
                {weeks.map((w) => (
                  <th key={w.week} className="px-1 py-1 text-center font-medium whitespace-nowrap">
                    {shortDate(w.week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g} className="border-t">
                  <th scope="row" className="py-1 pr-2 font-normal capitalize">
                    {g}
                  </th>
                  {weeks.map((w) => {
                    const n = w.groups[g] ?? 0;
                    const tone =
                      n === 0
                        ? "text-muted-foreground"
                        : n < VOLUME_MIN_SETS
                          ? "bg-warn/10"
                          : n > VOLUME_MAX_SETS
                            ? "bg-danger/15 font-medium"
                            : "bg-good/15";
                    return (
                      <td key={w.week} className={cn("px-1 py-1 text-center tabular-nums", tone)}>
                        {n || "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Shading: green in range, amber under {VOLUME_MIN_SETS}, red over {VOLUME_MAX_SETS}.
        </p>
      </Card>
    </div>
  );
}
