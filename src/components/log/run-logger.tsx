"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logRun } from "@/server/actions/log";
import { RunFeedbackForm } from "./run-feedback-form";

export function RunLogger({
  nowLocal,
  shinMax,
  readOnly,
}: {
  nowLocal: string;
  shinMax: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ start: nowLocal, duration: "", distance: "", avgHr: "", maxHr: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = (v: string) => (v === "" ? null : Number(v));
  const save = () =>
    start(async () => {
      const res = await logRun({
        start: f.start,
        durationMin: Number(f.duration),
        distanceKm: n(f.distance),
        avgHr: n(f.avgHr),
        maxHr: n(f.maxHr),
      });
      if (res.ok) {
        setMsg({ ok: true, text: res.message ?? "Saved." });
        setSaved(res.data!.workoutId);
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  const field = (key: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="grid gap-1">
      <Label htmlFor={`r-${key}`}>{label}</Label>
      <Input
        id={`r-${key}`}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        {...props}
      />
    </div>
  );
  if (saved)
    return (
      <div className="grid gap-4">
        <p role="status" className="text-sm text-good">
          {msg?.text}
        </p>
        <RunFeedbackForm workoutId={saved} shinMax={shinMax} />
        <div>
          <Button variant="outline" size="sm" onClick={() => (setSaved(null), setMsg(null))}>
            Log another run
          </Button>
        </div>
      </div>
    );
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">{field("start", "Start", { type: "datetime-local" })}</div>
        {field("duration", "Duration (min)", {
          type: "number",
          min: 1,
          step: 0.5,
          inputMode: "decimal",
          required: true,
        })}
        {field("distance", "Distance (km)", { type: "number", min: 0, step: 0.01, inputMode: "decimal" })}
        {field("avgHr", "Avg HR", { type: "number", min: 30, max: 250, inputMode: "numeric" })}
        {field("maxHr", "Max HR", { type: "number", min: 30, max: 250, inputMode: "numeric" })}
      </div>
      <p className="text-xs text-muted-foreground">
        Quick-add is for runs without a watch export. Imported runs include intervals; a quick-added run
        counts towards your run plan either way.
      </p>
      <FormError message={msg && !msg.ok ? msg.text : null} />
      <div>
        <Button onClick={save} disabled={pending || readOnly || !f.duration}>
          {pending ? "Saving…" : "Save run"}
        </Button>
      </div>
    </div>
  );
}
