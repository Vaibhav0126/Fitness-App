import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { MetricTrend } from "@/components/charts/presets";
import { Card } from "@/components/ui/card";
import { getDashboard } from "@/server/dashboard";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Recovery" };

const METRICS = [
  { key: "hrv", title: "HRV (SDNN)", unit: "ms", decimals: 0, hint: "Higher than your baseline is good." },
  {
    key: "rhr",
    title: "Resting heart rate",
    unit: "bpm",
    decimals: 0,
    hint: "Lower than your baseline is good.",
  },
  { key: "sleep", title: "Sleep", unit: "h", decimals: 1, hint: "Attributed to the morning you woke up." },
  { key: "steps", title: "Steps", unit: "steps", decimals: 0, hint: "Daily total.", zero: true },
] as const;

export default async function RecoveryPage() {
  const user = await requireUser();
  const { recovery } = await getDashboard(user.id);
  const any = METRICS.some((m) => recovery[m.key].length > 0);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">Recovery</h1>
        <p className="text-muted-foreground">Last 90 days with a 7-day rolling average.</p>
      </header>
      {!any ? (
        <EmptyState
          title="No recovery data yet"
          text="Import Metrics.json from Health Auto Export (HRV, resting heart rate, sleep and steps)."
          href="/app/import?tab=hae"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {METRICS.map((m) => {
            const pts = recovery[m.key];
            const last = pts.at(-1);
            return (
              <Card key={m.key} className="grid gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">{m.title}</h2>
                  {last ? (
                    <span className="text-sm tabular-nums">
                      <span className="font-semibold">
                        {last.avg.toLocaleString("en-US", { maximumFractionDigits: m.decimals })}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">{m.unit} 7-day avg</span>
                    </span>
                  ) : null}
                </div>
                {pts.length > 1 ? (
                  <MetricTrend
                    title={`Per day (${m.unit})`}
                    points={pts}
                    unit={m.unit}
                    decimals={m.decimals}
                    zero={"zero" in m ? m.zero : undefined}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                )}
                <p className="text-xs text-muted-foreground">{m.hint}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
