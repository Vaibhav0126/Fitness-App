import type { Insight } from "@/lib/engine";
import { cn } from "@/lib/utils";

const tone = { info: "border-l-border", good: "border-l-good", warn: "border-l-warn" } as const;

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={cn("rounded-lg border border-l-4 bg-card p-4", tone[insight.severity])}>
      <h3 className="font-medium">{insight.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
      {insight.evidence.length ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Why?</summary>
          <ul className="mt-1 list-disc pl-4">
            {insight.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
