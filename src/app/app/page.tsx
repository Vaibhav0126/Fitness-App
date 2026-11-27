import type { Metadata } from "next";
import { InsightCard } from "@/components/app/insight-card";
import { getDashboard } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Today" };

const badge = {
  good: "bg-good/15 text-good",
  ok: "bg-warn/15 text-warn",
  low: "bg-danger/15 text-danger",
  unknown: "bg-muted text-muted-foreground",
} as const;

// Phase 1a: functional Today view. Full page design lands in Phase 1b.
export default async function TodayPage() {
  const user = await requireUser();
  const state = await getDashboard(user.id);
  const { today, next } = state;
  return (
    <div className="grid gap-6">
      <section className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{today.label}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge[today.readiness]}`}>
          Readiness: {today.readiness}
        </span>
      </section>
      <section aria-labelledby="insights" className="grid gap-3">
        <h2 id="insights" className="sr-only">
          Insights
        </h2>
        {today.insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </section>
      {next ? (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">
            Next: {next.title} <span className="text-muted-foreground">({next.label})</span>
          </h2>
          <p className="text-sm text-muted-foreground">{next.goal}</p>
          {next.strength ? (
            <ul className="mt-3 grid gap-1 text-sm">
              {next.strength.exercises.map((e) => (
                <li key={e.exercise} className="flex justify-between gap-4">
                  <span>{e.exercise}</span>
                  <span className="font-mono">{e.target}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
