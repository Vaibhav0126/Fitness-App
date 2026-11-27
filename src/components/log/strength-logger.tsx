"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logStrength } from "@/server/actions/log";

type Row = { exercise: string; weightKg: string; reps: string; warmup: boolean };

export interface LoggerSuggestion {
  title: string;
  rows: Array<{ exercise: string; weightKg: number | null; reps: number | null }>;
}

export function StrengthLogger({
  nowLocal,
  exercises,
  suggestion,
  readOnly,
}: {
  /** "YYYY-MM-DDTHH:mm" in the user's zone */
  nowLocal: string;
  exercises: string[];
  suggestion: LoggerSuggestion | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const blank: Row = { exercise: "", weightKg: "", reps: "", warmup: false };
  const [start, setStart] = useState(nowLocal);
  const [title, setTitle] = useState(suggestion?.title ?? "");
  const [duration, setDuration] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    suggestion?.rows.length
      ? suggestion.rows.map((r) => ({
          exercise: r.exercise,
          weightKg: r.weightKg != null ? String(r.weightKg) : "",
          reps: r.reps != null ? String(r.reps) : "",
          warmup: false,
        }))
      : [blank],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () =>
    startTransition(async () => {
      const filled = rows.filter((r) => r.exercise.trim() || r.reps);
      const res = await logStrength({
        start,
        title: title || undefined,
        durationMin: duration ? Number(duration) : undefined,
        sets: filled.map((r) => ({
          exercise: r.exercise,
          weightKg: r.weightKg === "" ? null : Number(r.weightKg),
          reps: Number(r.reps),
          warmup: r.warmup,
        })),
      });
      if (res.ok) {
        setMsg({ ok: true, text: `${res.message} ${res.data?.sets ?? 0} sets.` });
        setRows([blank]);
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="s-start">Start</Label>
          <Input
            id="s-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="s-title">Title</Label>
          <Input
            id="s-title"
            value={title}
            placeholder="Upper A"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="s-dur">Duration (min)</Label>
          <Input
            id="s-dur"
            type="number"
            min={0}
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
      </div>
      <datalist id="exercise-names">
        {exercises.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="grid gap-2">
        <div className="grid grid-cols-[1fr_4.5rem_4rem_2.5rem_2.5rem] gap-2 text-xs text-muted-foreground">
          <span>Exercise</span>
          <span>kg</span>
          <span>Reps</span>
          <span title="Warm-up">W</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_4rem_2.5rem_2.5rem] items-center gap-2">
            <Input
              aria-label={`Set ${i + 1} exercise`}
              list="exercise-names"
              value={r.exercise}
              onChange={(e) => set(i, { exercise: e.target.value })}
            />
            <Input
              aria-label={`Set ${i + 1} weight (kg)`}
              type="number"
              step={0.25}
              min={0}
              inputMode="decimal"
              value={r.weightKg}
              onChange={(e) => set(i, { weightKg: e.target.value })}
            />
            <Input
              aria-label={`Set ${i + 1} reps`}
              type="number"
              min={1}
              inputMode="numeric"
              value={r.reps}
              onChange={(e) => set(i, { reps: e.target.value })}
            />
            <input
              aria-label={`Set ${i + 1} is a warm-up`}
              type="checkbox"
              checked={r.warmup}
              onChange={(e) => set(i, { warmup: e.target.checked })}
              className="size-4 justify-self-center accent-primary"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove set ${i + 1}`}
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank]))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { ...(rs.at(-1) ?? blank), warmup: false }])}
          >
            <Plus className="size-4" aria-hidden /> Same again
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, blank])}>
            <Plus className="size-4" aria-hidden /> New exercise
          </Button>
        </div>
      </div>
      <FormError message={msg && !msg.ok ? msg.text : null} />
      {msg?.ok ? (
        <p role="status" className="text-sm text-good">
          {msg.text}
        </p>
      ) : null}
      <div>
        <Button onClick={save} disabled={pending || readOnly}>
          {pending ? "Saving…" : "Save session"}
        </Button>
      </div>
    </div>
  );
}
