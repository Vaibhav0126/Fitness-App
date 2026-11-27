"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { type DayKey, type PlanConfig, planConfigSchema, type RoutineItem } from "@/lib/engine/config";
import { savePlan } from "@/server/actions/settings";

const DAYS: Array<[DayKey, string]> = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["0", "Sunday"],
];

const num = (v: string) => (v === "" ? 0 : Number(v));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fromMmss = (v: string) => {
  const [m, s] = v.split(":");
  return Math.max(0, Math.round(num(m ?? "0") * 60 + num(s ?? "0")));
};

function validate(cfg: PlanConfig): string | null {
  const r = planConfigSchema.safeParse(cfg);
  if (r.success) return null;
  return r.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "plan"}: ${i.message}`)
    .join("; ");
}

export function PlanEditor({ initial, readOnly }: { initial: PlanConfig; readOnly: boolean }) {
  const [cfg, setCfg] = useState<PlanConfig>(initial);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState(() => JSON.stringify(initial, null, 2));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const routineNames = Object.keys(cfg.routines);
  const clientError = useMemo(() => (mode === "form" ? validate(cfg) : null), [cfg, mode]);

  const update = (fn: (c: PlanConfig) => PlanConfig) => {
    setStatus(null);
    setCfg((c) => fn(structuredClone(c)));
  };

  const switchMode = (m: "form" | "json") => {
    if (m === mode) return;
    if (m === "json") setJson(JSON.stringify(cfg, null, 2));
    else {
      try {
        const parsed = planConfigSchema.safeParse(JSON.parse(json));
        if (!parsed.success) {
          setStatus({ ok: false, text: `Fix the JSON first. ${validate(JSON.parse(json) as PlanConfig)}` });
          return;
        }
        setCfg(parsed.data);
      } catch {
        setStatus({ ok: false, text: "That isn't valid JSON." });
        return;
      }
    }
    setStatus(null);
    setMode(m);
  };

  const save = () =>
    start(async () => {
      const body = mode === "json" ? json : JSON.stringify(cfg);
      const res = await savePlan(body);
      setStatus(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
      if (res.ok && mode === "json") setCfg(JSON.parse(body) as PlanConfig);
    });

  const renameRoutine = (from: string, to: string) =>
    update((c) => {
      if (!to || to === from || c.routines[to]) return c;
      c.routines = Object.fromEntries(Object.entries(c.routines).map(([k, v]) => [k === from ? to : k, v]));
      for (const [k] of DAYS) if (c.schedule[k].routine === from) c.schedule[k].routine = to;
      return c;
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-md border p-0.5 text-sm">
          {(["form", "json"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded px-3 py-1.5 ${mode === m ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {m === "form" ? "Editor" : "Advanced (JSON)"}
            </button>
          ))}
        </div>
        <Button onClick={save} disabled={pending || readOnly || Boolean(clientError)}>
          {pending ? "Saving…" : "Save plan"}
        </Button>
      </div>
      {readOnly ? <p className="text-sm text-muted-foreground">The demo plan is read-only.</p> : null}
      <FormError message={status && !status.ok ? status.text : clientError} />
      {status?.ok ? (
        <p role="status" className="text-sm text-good">
          {status.text}
        </p>
      ) : null}

      {mode === "json" ? (
        <Card className="grid gap-2">
          <Label htmlFor="plan-json">Plan JSON</Label>
          <Textarea
            id="plan-json"
            value={json}
            onChange={(e) => {
              setStatus(null);
              setJson(e.target.value);
            }}
            spellCheck={false}
            className="min-h-[60vh] font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Validated on save. The time zone comes from your profile and overrides the value here.
          </p>
        </Card>
      ) : (
        <>
          <Card className="grid gap-4">
            <CardTitle>Week</CardTitle>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="planStart">Plan start</Label>
              <Input
                id="planStart"
                type="date"
                value={cfg.planStart}
                onChange={(e) => update((c) => ({ ...c, planStart: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Runs from this date count towards run-plan week 1.
              </p>
            </div>
            <div className="grid gap-2">
              {DAYS.map(([k, label]) => {
                const day = cfg.schedule[k];
                const lifts = day.kind === "strength" || day.kind === "strength+run";
                return (
                  <div
                    key={k}
                    className="grid grid-cols-[6rem_1fr] items-center gap-2 sm:grid-cols-[7rem_12rem_1fr]"
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <Select
                      aria-label={`${label} session`}
                      value={day.kind}
                      onChange={(e) =>
                        update((c) => {
                          const kind = e.target.value as typeof day.kind;
                          const needs = kind === "strength" || kind === "strength+run";
                          c.schedule[k] = needs
                            ? { kind, routine: day.routine ?? routineNames[0] }
                            : { kind };
                          return c;
                        })
                      }
                    >
                      <option value="strength">Strength</option>
                      <option value="run">Run</option>
                      <option value="strength+run">Strength + run</option>
                      <option value="rest">Rest</option>
                    </Select>
                    {lifts ? (
                      <Select
                        aria-label={`${label} routine`}
                        className="col-start-2 sm:col-start-3"
                        value={day.routine ?? ""}
                        onChange={(e) =>
                          update((c) => {
                            c.schedule[k] = { kind: day.kind, routine: e.target.value };
                            return c;
                          })
                        }
                      >
                        {routineNames.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="grid gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Routines</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((c) => {
                    let n = Object.keys(c.routines).length + 1;
                    while (c.routines[`Routine ${n}`]) n++;
                    c.routines[`Routine ${n}`] = [["Squat (Barbell)", 3, 5, 8]];
                    return c;
                  })
                }
              >
                <Plus className="size-4" aria-hidden /> Routine
              </Button>
            </div>
            <CardDescription>
              Each exercise has sets and a rep range. Hit the top of the range on every set and the weight
              goes up.
            </CardDescription>
            {routineNames.map((name) => (
              <RoutineBlock
                key={name}
                name={name}
                items={cfg.routines[name]!}
                onRename={(to) => renameRoutine(name, to)}
                onChange={(items) =>
                  update((c) => {
                    c.routines[name] = items;
                    return c;
                  })
                }
                onRemove={
                  routineNames.length > 1
                    ? () =>
                        update((c) => {
                          delete c.routines[name];
                          for (const [k] of DAYS)
                            if (c.schedule[k].routine === name) c.schedule[k] = { kind: "rest" };
                          return c;
                        })
                    : undefined
                }
              />
            ))}
            <RoutineBlock
              name="Hotel routine"
              fixedName
              items={cfg.hotelRoutine}
              onChange={(items) => update((c) => ({ ...c, hotelRoutine: items }))}
            />
          </Card>

          <Card className="grid gap-4">
            <CardTitle>Run plan</CardTitle>
            <CardDescription>
              {cfg.progression.runsPerWeek} runs complete a week. A run with shin pain over{" "}
              {cfg.progression.shinMax}/10 repeats the week.
            </CardDescription>
            <div className="grid gap-2">
              <div className="grid grid-cols-[3rem_4rem_5rem_5rem_1fr_2.5rem] gap-2 text-xs text-muted-foreground">
                <span>Week</span>
                <span>Reps</span>
                <span>Run</span>
                <span>Walk</span>
                <span>Note</span>
              </div>
              {cfg.runPlan.map((w, i) => (
                <div
                  key={w.week}
                  className="grid grid-cols-[3rem_4rem_5rem_5rem_1fr_2.5rem] items-center gap-2"
                >
                  <span className="text-sm">{w.week}</span>
                  <Input
                    aria-label={`Week ${w.week} reps`}
                    type="number"
                    min={1}
                    value={w.reps}
                    onChange={(e) => update((c) => ((c.runPlan[i]!.reps = num(e.target.value)), c))}
                  />
                  <Input
                    aria-label={`Week ${w.week} run (m:ss)`}
                    defaultValue={mmss(w.runS)}
                    onBlur={(e) => update((c) => ((c.runPlan[i]!.runS = fromMmss(e.target.value)), c))}
                  />
                  <Input
                    aria-label={`Week ${w.week} walk (m:ss)`}
                    defaultValue={mmss(w.walkS)}
                    onBlur={(e) => update((c) => ((c.runPlan[i]!.walkS = fromMmss(e.target.value)), c))}
                  />
                  <Input
                    aria-label={`Week ${w.week} note`}
                    value={w.note ?? ""}
                    onChange={(e) =>
                      update((c) => {
                        const v = e.target.value;
                        if (v) c.runPlan[i]!.note = v;
                        else delete c.runPlan[i]!.note;
                        return c;
                      })
                    }
                  />
                  <IconButton
                    label={`Remove week ${w.week}`}
                    disabled={cfg.runPlan.length <= 1}
                    onClick={() =>
                      update((c) => {
                        c.runPlan.splice(i, 1);
                        c.runPlan.forEach((x, j) => (x.week = j + 1));
                        return c;
                      })
                    }
                  />
                </div>
              ))}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((c) => {
                      const last = c.runPlan.at(-1)!;
                      c.runPlan.push({
                        week: c.runPlan.length + 1,
                        reps: last.reps,
                        runS: last.runS,
                        walkS: last.walkS,
                      });
                      return c;
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden /> Week
                </Button>
              </div>
            </div>
          </Card>

          <Card className="grid gap-4">
            <CardTitle>Run targets and progression</CardTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField
                label="Speed min (km/h)"
                value={cfg.runTargets.speedKmhMin}
                step={0.1}
                onChange={(v) => update((c) => ((c.runTargets.speedKmhMin = v), c))}
              />
              <NumField
                label="Speed max (km/h)"
                value={cfg.runTargets.speedKmhMax}
                step={0.1}
                onChange={(v) => update((c) => ((c.runTargets.speedKmhMax = v), c))}
              />
              <NumField
                label="Heart rate cap"
                value={cfg.runTargets.hrCap}
                onChange={(v) => update((c) => ((c.runTargets.hrCap = v), c))}
              />
              <NumField
                label="Cadence min"
                value={cfg.runTargets.cadenceMin}
                onChange={(v) => update((c) => ((c.runTargets.cadenceMin = v), c))}
              />
              <NumField
                label="Cadence max"
                value={cfg.runTargets.cadenceMax}
                onChange={(v) => update((c) => ((c.runTargets.cadenceMax = v), c))}
              />
              <NumField
                label="Runs per week"
                value={cfg.progression.runsPerWeek}
                onChange={(v) => update((c) => ((c.progression.runsPerWeek = v), c))}
              />
              <NumField
                label="Shin pain limit (0–10)"
                value={cfg.progression.shinMax}
                onChange={(v) => update((c) => ((c.progression.shinMax = v), c))}
              />
              <NumField
                label="Barbell step (kg)"
                value={cfg.progression.weightStepKg}
                step={0.25}
                onChange={(v) => update((c) => ((c.progression.weightStepKg = v), c))}
              />
              <NumField
                label="Dumbbell step (kg)"
                value={cfg.progression.dumbbellStepKg}
                step={0.25}
                onChange={(v) => update((c) => ((c.progression.dumbbellStepKg = v), c))}
              />
              <NumField
                label="Walk speed (km/h)"
                value={cfg.runClassification.walkSpeedKmh}
                step={0.1}
                onChange={(v) => update((c) => ((c.runClassification.walkSpeedKmh = v), c))}
              />
              <NumField
                label="Run margin (km/h)"
                value={cfg.runClassification.marginKmh}
                step={0.1}
                onChange={(v) => update((c) => ((c.runClassification.marginKmh = v), c))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Imported intervals faster than walk speed + margin count as running.
            </p>
          </Card>

          <Card className="grid gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Trips</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((c) => {
                    c.trips.push({ from: c.planStart, to: c.planStart, label: "Trip" });
                    return c;
                  })
                }
              >
                <Plus className="size-4" aria-hidden /> Trip
              </Button>
            </div>
            <CardDescription>During a trip, strength days use the hotel routine.</CardDescription>
            {cfg.trips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trips planned.</p>
            ) : null}
            {cfg.trips.map((t, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1.5fr_2.5rem]">
                <Input
                  aria-label="From"
                  type="date"
                  value={t.from}
                  onChange={(e) => update((c) => ((c.trips[i]!.from = e.target.value), c))}
                />
                <Input
                  aria-label="To"
                  type="date"
                  value={t.to}
                  onChange={(e) => update((c) => ((c.trips[i]!.to = e.target.value), c))}
                />
                <Input
                  aria-label="Label"
                  value={t.label}
                  onChange={(e) => update((c) => ((c.trips[i]!.label = e.target.value), c))}
                />
                <IconButton label="Remove trip" onClick={() => update((c) => (c.trips.splice(i, 1), c))} />
                <Input
                  aria-label="Note"
                  placeholder="Note (optional)"
                  className="sm:col-span-3"
                  value={t.note ?? ""}
                  onChange={(e) =>
                    update((c) => {
                      if (e.target.value) c.trips[i]!.note = e.target.value;
                      else delete c.trips[i]!.note;
                      return c;
                    })
                  }
                />
              </div>
            ))}
          </Card>

          <Card className="grid gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Goals and key lifts</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((c) => {
                    c.goals.push({ exercise: "Squat (Barbell)", weightKg: 100, reps: 5 });
                    return c;
                  })
                }
              >
                <Plus className="size-4" aria-hidden /> Goal
              </Button>
            </div>
            {cfg.goals.map((g, i) => (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem_2.5rem] items-center gap-2">
                <Input
                  aria-label="Exercise"
                  value={g.exercise}
                  onChange={(e) => update((c) => ((c.goals[i]!.exercise = e.target.value), c))}
                />
                <Input
                  aria-label="Weight (kg, blank for bodyweight)"
                  type="number"
                  step={0.5}
                  placeholder="kg"
                  value={g.weightKg ?? ""}
                  onChange={(e) =>
                    update((c) => {
                      if (e.target.value === "") delete c.goals[i]!.weightKg;
                      else c.goals[i]!.weightKg = num(e.target.value);
                      return c;
                    })
                  }
                />
                <Input
                  aria-label="Reps"
                  type="number"
                  min={1}
                  value={g.reps}
                  onChange={(e) => update((c) => ((c.goals[i]!.reps = num(e.target.value)), c))}
                />
                <IconButton label="Remove goal" onClick={() => update((c) => (c.goals.splice(i, 1), c))} />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="keyLifts">Key lifts (one per line)</Label>
              <Textarea
                id="keyLifts"
                defaultValue={cfg.keyLifts.join("\n")}
                onBlur={(e) =>
                  update((c) => ({
                    ...c,
                    keyLifts: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Shown first on the Strength page. Use exact exercise names.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function RoutineBlock({
  name,
  items,
  fixedName,
  onRename,
  onChange,
  onRemove,
}: {
  name: string;
  items: RoutineItem[];
  fixedName?: boolean;
  onRename?: (to: string) => void;
  onChange: (items: RoutineItem[]) => void;
  onRemove?: () => void;
}) {
  const set = (i: number, j: 0 | 1 | 2 | 3, v: string) => {
    const next = items.map((x) => [...x] as RoutineItem);
    if (j === 0) next[i]![0] = v;
    else next[i]![j] = num(v);
    onChange(next);
  };
  return (
    <section className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        {fixedName ? (
          <h3 className="font-medium">{name}</h3>
        ) : (
          <Input
            aria-label="Routine name"
            defaultValue={name}
            className="max-w-xs font-medium"
            onBlur={(e) => onRename?.(e.target.value.trim())}
          />
        )}
        {onRemove ? <IconButton label={`Remove ${name}`} onClick={onRemove} /> : null}
      </div>
      <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem_2.5rem] gap-2 text-xs text-muted-foreground">
        <span>Exercise</span>
        <span>Sets</span>
        <span>Reps lo</span>
        <span>Reps hi</span>
      </div>
      {items.map(([ex, sets, lo, hi], i) => (
        <div key={i} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem_2.5rem] items-center gap-2">
          <Input aria-label="Exercise" value={ex} onChange={(e) => set(i, 0, e.target.value)} />
          <Input
            aria-label="Sets"
            type="number"
            min={1}
            max={10}
            value={sets}
            onChange={(e) => set(i, 1, e.target.value)}
          />
          <Input
            aria-label="Reps low"
            type="number"
            min={1}
            value={lo}
            onChange={(e) => set(i, 2, e.target.value)}
          />
          <Input
            aria-label="Reps high"
            type="number"
            min={1}
            value={hi}
            onChange={(e) => set(i, 3, e.target.value)}
          />
          <IconButton label={`Remove ${ex}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div>
        <Button variant="ghost" size="sm" onClick={() => onChange([...items, ["", 3, 8, 12]])}>
          <Plus className="size-4" aria-hidden /> Exercise
        </Button>
      </div>
    </section>
  );
}

function NumField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = `n-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}
