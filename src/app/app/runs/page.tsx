import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { InsightCard } from "@/components/app/insight-card";
import { IntervalCharts, type IntervalPoint } from "@/components/charts/presets";
import { RunFeedbackForm } from "@/components/log/run-feedback-form";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { fmtDay } from "@/lib/engine/dates";
import { cn } from "@/lib/utils";
import { getDashboardBundle } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Runs" };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const SHOWN = 20;
const SHORT: Record<string, string> = { walk: "W", warmup: "WU", cooldown: "CD" };

export default async function RunsPage() {
  const user = await requireUser();
  const { state, settings } = await getDashboardBundle(user.id);
  const { plan, runs } = state;
  const cfg = settings.config;
  const recent = [...runs].reverse().slice(0, SHOWN);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="text-muted-foreground">
          {plan.complete
            ? "Run-walk plan complete."
            : `Week ${plan.week} of ${plan.weeks.length} · ${plan.runsThisWeek}/${plan.runsPerWeek} runs done this week`}
          {plan.repeatPending ? " · this week will repeat (shin pain)" : ""}
        </p>
      </header>

      <Card className="grid gap-3">
        <CardTitle>Plan</CardTitle>
        <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {plan.weeks.map((w) => (
            <li
              key={w.week}
              aria-current={w.status === "current" ? "step" : undefined}
              className={cn(
                "grid gap-0.5 rounded-md border p-2 text-center text-xs",
                w.status === "done" && "border-good/40 bg-good/10",
                w.status === "current" && "border-primary ring-2 ring-primary/30",
              )}
            >
              <span className="font-medium">
                W{w.week}
                <span className="sr-only"> ({w.status})</span>
              </span>
              <span className="tabular-nums">
                {w.reps}×{mmss(w.runS)}
              </span>
              <span className="text-muted-foreground tabular-nums">walk {mmss(w.walkS)}</span>
            </li>
          ))}
        </ol>
        <CardDescription>
          Every {plan.runsPerWeek} runs move you up a week, unless shin pain goes over{" "}
          {cfg.progression.shinMax}/10. Targets: {cfg.runTargets.speedKmhMin}–{cfg.runTargets.speedKmhMax}{" "}
          km/h, HR under {cfg.runTargets.hrCap}, cadence {cfg.runTargets.cadenceMin}–
          {cfg.runTargets.cadenceMax}.
        </CardDescription>
      </Card>

      {recent.length === 0 ? (
        <EmptyState
          title="No runs yet"
          text="Import Workouts.json from Health Auto Export to get run-walk intervals, or quick-add a run."
          secondary={{ href: "/app/log", label: "Quick-add a run" }}
        />
      ) : (
        <section className="grid gap-3" aria-labelledby="runs-h">
          <h2 id="runs-h" className="font-semibold">
            Recent runs
          </h2>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  {["Date", "Plan", "Time", "km", "km/h", "Peak HR", "Cadence", "Shin"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`#run-${r.id}`} className="underline-offset-2 hover:underline">
                        {fmtDay(r.date)}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      W{r.planWeek}.{r.runInWeek}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.durationMin ?? "–"}′</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.distanceKm ?? "–"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.avgSpeedKmh ?? "–"}</td>
                    <td
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        r.summary.peakHr != null && r.summary.peakHr >= cfg.runTargets.hrCap && "text-warn",
                      )}
                    >
                      {r.summary.peakHr ?? "–"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.avgCadence ?? "–"}</td>
                    <td
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        (r.feedback?.shinPain ?? 0) > cfg.progression.shinMax && "font-medium text-danger",
                      )}
                    >
                      {r.feedback?.shinPain != null ? `${r.feedback.shinPain}/10` : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {recent.map((r) => {
            let runNo = 0;
            const intervals: IntervalPoint[] = r.intervals.map((iv) => ({
              label: iv.kind === "run" ? `R${++runNo}` : (SHORT[iv.kind] ?? iv.kind),
              kind: iv.kind,
              speed: iv.avgSpeedKmh ?? null,
              hr: iv.maxHr ?? null,
              cadence: iv.cadence ?? null,
            }));
            return (
              <details key={r.id} id={`run-${r.id}`} className="group rounded-lg border bg-card">
                <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-4 py-3">
                  <span className="font-medium">
                    {fmtDay(r.date)} · W{r.planWeek}.{r.runInWeek}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.summary.runIntervals ? `${r.summary.runIntervals} run intervals` : r.source}
                    {r.feedback ? "" : " · needs feedback"}
                  </span>
                </summary>
                <div className="grid gap-4 border-t px-4 py-4">
                  {intervals.length ? (
                    <IntervalCharts intervals={intervals} targets={cfg.runTargets} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No interval data for this run.</p>
                  )}
                  {r.insights.map((i) => (
                    <InsightCard key={i.id} insight={i} />
                  ))}
                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium">How did it feel?</h3>
                    <RunFeedbackForm
                      workoutId={r.id}
                      initial={r.feedback}
                      shinMax={cfg.progression.shinMax}
                      readOnly={Boolean(user.isDemo)}
                      compact
                    />
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
