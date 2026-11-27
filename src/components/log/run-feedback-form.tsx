"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { saveRunFeedback } from "@/server/actions/log";

function Slider({
  id,
  label,
  value,
  min,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <output htmlFor={id} className="tabular-nums">
          {value}/10
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RunFeedbackForm({
  workoutId,
  initial,
  shinMax,
  readOnly,
  compact,
}: {
  workoutId: string;
  initial?: { shinPain?: number | null; calfPain?: number | null; effort?: number | null } | null;
  shinMax: number;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [shin, setShin] = useState(initial?.shinPain ?? 0);
  const [calf, setCalf] = useState(initial?.calfPain ?? 0);
  const [effort, setEffort] = useState(initial?.effort ?? 5);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveRunFeedback({ workoutId, shinPain: shin, calfPain: calf, effort });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  return (
    <div className={compact ? "grid gap-3" : "grid gap-4"}>
      <Slider
        id={`shin-${workoutId}`}
        label="Shin pain"
        value={shin}
        min={0}
        onChange={setShin}
        hint={`Over ${shinMax} repeats this run-plan week.`}
      />
      <Slider
        id={`calf-${workoutId}`}
        label="Calf pain"
        value={calf}
        min={0}
        onChange={setCalf}
        hint="0 = none"
      />
      <Slider
        id={`effort-${workoutId}`}
        label="Effort"
        value={effort}
        min={1}
        onChange={setEffort}
        hint="1 = very easy, 10 = max"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending || readOnly}>
          {pending ? "Saving…" : initial ? "Update feedback" : "Save feedback"}
        </Button>
        {msg?.ok ? (
          <span role="status" className="text-sm text-good">
            {msg.text}
          </span>
        ) : null}
      </div>
      <FormError message={msg && !msg.ok ? msg.text : null} />
    </div>
  );
}
