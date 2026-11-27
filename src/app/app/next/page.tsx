import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { InsightCard } from "@/components/app/insight-card";
import { RunBlock, StrengthList } from "@/components/app/prescriptions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDashboard } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Next workout" };

export default async function NextPage() {
  const user = await requireUser();
  const { next } = await getDashboard(user.id);
  if (!next)
    return (
      <EmptyState
        title="No training days scheduled"
        text="Every day in your plan is a rest day. Add strength or run days in the plan editor."
        href="/app/settings/plan"
        cta="Edit plan"
      />
    );
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{next.label}</p>
        <h1 className="text-2xl font-bold">{next.title}</h1>
        <p className="text-muted-foreground">{next.goal}</p>
      </header>
      {next.items.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
      {next.strength ? (
        <Card className="grid gap-2">
          <CardTitle>
            {next.strength.routine}
            {next.strength.hotel ? " (no gym needed)" : ""}
          </CardTitle>
          <StrengthList exercises={next.strength.exercises} detailed />
          <p className="text-xs text-muted-foreground">
            Weights are for working sets. Warm up first; warm-ups don&apos;t count towards progression.
          </p>
        </Card>
      ) : null}
      {next.run ? (
        <Card className="grid gap-2">
          <CardTitle>Run</CardTitle>
          <RunBlock run={next.run} />
        </Card>
      ) : null}
      <div>
        <Link href="/app/log" className={buttonVariants({ variant: "outline" })}>
          Log it manually
        </Link>
      </div>
    </div>
  );
}
