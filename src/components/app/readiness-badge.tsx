import type { ReadinessLevel } from "@/lib/engine";
import { cn } from "@/lib/utils";

const STYLE: Record<ReadinessLevel, { cls: string; label: string; icon: string }> = {
  good: { cls: "bg-good/15 text-good", label: "Ready", icon: "●" },
  ok: { cls: "bg-good/10 text-good", label: "OK", icon: "◐" },
  low: { cls: "bg-danger/15 text-danger", label: "Take it easy", icon: "▼" },
  unknown: { cls: "bg-muted text-muted-foreground", label: "Not enough data", icon: "?" },
};

export function ReadinessBadge({ level, className }: { level: ReadinessLevel; className?: string }) {
  const s = STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        s.cls,
        className,
      )}
    >
      <span aria-hidden>{s.icon}</span>
      <span>
        <span className="sr-only">Readiness: </span>
        {s.label}
      </span>
    </span>
  );
}
