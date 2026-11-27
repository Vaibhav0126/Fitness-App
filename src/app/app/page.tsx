import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { InsightCard } from "@/components/app/insight-card";
import { RunBlock, StrengthList } from "@/components/app/prescriptions";
import { ReadinessBadge } from "@/components/app/readiness-badge";
import { RunFeedbackForm } from "@/components/log/run-feedback-form";
import { Card } from "@/components/ui/card";
import { getDashboardBundle } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Today" };

const SIGNAL = { hrv: "HRV", rhr: "Resting HR", sleep: "Sleep" } as const;
const unit = { hrv: " ms", rhr: " bpm", sleep: " h" } as const;

export default async function TodayPage() {
  const user = await requireUser();
  const { state, store, settings } = await getDashboardBundle(user.id);
  const { today, next } = state;
  const hasData = store.metrics.length + store.workouts.length + store.sets.length > 0;
  const feedbackItems = today.insights.filter((i) => i.action?.kind === "run-feedback");
  const others = today.insights.filter((i) => !i.action);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{today.label}</h1>
          <ReadinessBadge level={today.readiness} />
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {(Object.keys(SIGNAL) as Array<keyof typeof SIGNAL>).map((k) => {
            const s = today.readinessDetail[k];
            return (
              <div key={k} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{SIGNAL[k]}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {s.current ? `${Math.round(s.current.v * 10) / 10}${unit[k]}` : "–"}
                </dd>
                <dd className={`text-xs ${s.flagged ? "text-danger" : "text-muted-foreground"}`}>
                  {s.flagged
                    ? "▼ below baseline"
                    : s.baseline != null
                      ? `baseline ${Math.round(s.baseline * 10) / 10}`
                      : "no baseline"}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {!hasData ? (
        <EmptyState
          title="No data yet"
          text="Import a Hevy or Strong CSV and your Health Auto Export files, or log a session by hand. Today, Next and the charts fill in from there."
          secondary={{ href: "/app/log", label: "Log manually" }}
        />
      ) : null}

      {feedbackItems.map((i) => (
        <Card key={i.id} className="grid gap-3 border-l-4 border-l-warn">
          <div>
            <h2 className="font-medium">{i.title}</h2>
            <p className="text-sm text-muted-foreground">{i.text}</p>
          </div>
          <RunFeedbackForm
            workoutId={i.action!.workoutId}
            shinMax={settings.config.progression.shinMax}
            readOnly={Boolean(user.isDemo)}
            compact
          />
        </Card>
      ))}

      {others.length ? (
        <section aria-labelledby="insights" className="grid gap-3">
          <h2 id="insights" className="text-sm font-medium text-muted-foreground">
            Today
          </h2>
          {others.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </section>
      ) : null}

      {next ? (
        <Card className="grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              Next: {next.title} <span className="font-normal text-muted-foreground">· {next.label}</span>
            </h2>
            <Link href="/app/next" className="text-sm text-primary underline-offset-4 hover:underline">
              Details
            </Link>
          </div>
          {next.easy ? (
            <p className="text-sm text-warn">Recovery is low: this is an easier version.</p>
          ) : null}
          {next.strength ? <StrengthList exercises={next.strength.exercises.slice(0, 4)} /> : null}
          {next.strength && next.strength.exercises.length > 4 ? (
            <p className="text-xs text-muted-foreground">+{next.strength.exercises.length - 4} more</p>
          ) : null}
          {next.run ? <RunBlock run={next.run} /> : null}
        </Card>
      ) : null}
    </div>
  );
}
