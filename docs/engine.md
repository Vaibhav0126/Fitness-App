# Coaching engine

`src/lib/engine/` is pure TypeScript: no I/O, no clock and no globals. `computeState(store, config, now)` always returns the same `DashboardState` for the same inputs. All calendar logic uses `config.timeZone` (IANA, via `Intl`).

| Module         | Responsibility                                                             |
| -------------- | -------------------------------------------------------------------------- |
| `config.ts`    | Zod `PlanConfig`, the default template and the "start from scratch" config |
| `dates.ts`     | Local dates and hours from instants, calendar arithmetic, formatting       |
| `metrics.ts`   | One value per day by source priority, series, rolling means                |
| `readiness.ts` | Readiness level and recovery insights                                      |
| `strength.ts`  | Sessions, working sets, e1RM, prescriptions, lift trends, goals            |
| `runs.ts`      | Run dedupe, summaries, run-walk plan progress, run analysis                |
| `volume.ts`    | Weekly working sets per muscle group and volume flags                      |
| `next.ts`      | Next-workout selection (noon rule, rest days, trips, strength+run)         |
| `index.ts`     | `computeState`, which assembles everything                                 |

Every insight has the shape `{ id, severity: "info" | "good" | "warn", title, text, evidence[] }`. The UI shows `evidence` under "Why?".

## Rules, with examples

### Readiness

- Signals: HRV (SDNN), resting HR and sleep.
- **Current value:** the latest entry dated today or yesterday. Anything older counts as missing.
- **Baseline:** the mean of up to 7 entries before the current one, within the last 30 days. It needs at least 3 entries.
- **Flags:**
  - HRV ≤ −15% vs baseline (the percentage is rounded first).
  - Resting HR ≥ +5 bpm vs baseline (rounded).
  - Sleep < 6 h.
- **Level:**
  - 2+ flags → `low`.
  - Otherwise, if fewer than 2 of the 3 signals can be evaluated → `unknown`.
  - Otherwise 1 flag → `ok`, 0 flags → `good`, using whichever signals are available.
- Any signal that can't be evaluated gets an insight naming it: "no value from today or yesterday" or "no baseline yet".
- Missing data never produces `low` on its own. Only two real flags do.

> HRV baseline 50 ms, today 42 ms → −16% → flagged. Resting HR 55 → 61 → +6 → flagged. Readiness is **low**, so the next session runs in easy mode.
>
> Only sleep was synced (5 h): one flag, but HRV and resting HR are missing (1 of 3 signals), so readiness is **unknown**.
>
> HRV has no baseline yet, resting HR and sleep are normal: 2 of 3 signals, no flags, so readiness is **good**, with a "Readiness without HRV" insight.

### Strength prescription

All rules use the **last session containing the exercise**, and only its **working sets**. Explicit `warmup` sets are dropped, as are sets under 60% of that session's top weight and sets without reps.

| Situation                     | Prescription                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| No history                    | `sets × repLo–repHi`, "Find a working weight: start light, stop 2–3 reps short of failure." |
| Every working set ≥ repHi     | top weight + step (`dumbbellStepKg` for dumbbell exercises, else `weightStepKg`) × repLo    |
| Otherwise                     | same top weight × `min(repHi, best reps at top weight + 1)`                                 |
| Bodyweight, below repHi       | `min(repHi, best + 1)` reps                                                                 |
| Bodyweight, every set ≥ repHi | "Add a little load" and restart at repLo                                                    |
| Readiness low (easy mode)     | one set fewer (min 1), same weight, `min(repHi, best)` reps (no increase)                   |

> Squat, range 5–8. Last session: 50×5 (a warm-up, under 60% of 100), 100×8, 100×8, 100×8. The working sets all hit 8, so the prescription is **102.5 kg × 3 × 5**.
>
> Last session: 100×8, 100×8, then a back-off set of 80×7. All three are working sets and 7 < 8, so the prescription is **100 kg × 3 × 8**.

### e1RM and goals

- Epley: `w × (1 + reps/30)`, only for 1–12 reps with a positive load.
- Goals of 12 reps or fewer with a load: progress = the latest session's best e1RM ÷ the goal's e1RM.
- Higher-rep or bodyweight goals: progress = the best `load × min(reps, goalReps)` ÷ `goalLoad × goalReps`.

### Run-walk plan

- Count runs dated on or after `planStart` and on or before today (local), after dedupe. Recordings that start within 20 minutes of each other are merged: keep the one with more intervals and fill in missing fields from the other.
- Every `runsPerWeek` runs completes a block. The week advances unless a run in that block had shin pain > `shinMax`; in that case the week repeats, and the UI says which run and what pain level caused it.
- The week never goes past the plan length. Finishing the last week sets `complete`.
- Feedback is matched to a run by `workoutId`, then by date.
- Runs and sets dated after `now` never count.

### Run analysis (2–4 insights per run)

1. A summary: week, run number, distance, duration and average HR.
2. Speed of the run intervals (or the whole workout when there are no intervals) vs the target band: above, inside or below.
3. Peak HR vs the cap. **Above the cap warns** (no tolerance).
4. Either uneven pacing (the last interval is more than 0.7 km/h faster than the first) or cadence vs its band.

### Next workout

- Start from today. Move to tomorrow if local time is ≥ 12:00, or if today's planned session is already logged. A `strength+run` day needs both parts logged.
- Skip rest days.
- On trip dates, the strength part uses `hotelRoutine`, with the same progression rules.

### Weekly volume

- Working sets per muscle group per ISO week (starting Monday).
- Flags apply only to groups trained by the plan's routines, and only for the **last complete** week:
  - under 10 sets → info
  - over 22 sets → warn
- The flagged groups are combined into one insight per direction ("Low weekly volume: back 8, chest 8"), so a light template doesn't flood Today.

## Differences from `reference/engine.js`

Agreed 2026-11-27: where the spec is explicit, the spec wins; otherwise the reference behaviour is kept. `test/unit/engine/parity.test.ts` runs both engines on scenarios where they should agree.

| #   | Area                | reference/engine.js                                | This engine                                                                                            | Why                                  |
| --- | ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | Time zone           | Fixed `tzOffsetMin`                                | IANA zone via `Intl`, DST-safe                                                                         | Spec §6                              |
| 2   | Readiness level     | `good` if any metric exists and nothing is flagged | `unknown` with fewer than 2 evaluable signals; missing signals are named (2+ real flags still → `low`) | Spec: missing data → unknown         |
| 3   | Readiness freshness | Latest value anywhere in the last 30 days          | Latest value must be from today or yesterday                                                           | Stale data is missing data           |
| 4   | Progression         | Top-weight sets only; no warm-up detection         | All working sets; warm-ups = `warmup` type or < 60% of the session's top weight                        | Spec §4.4/§6.2, decision 2026-11-27  |
| 5   | Repeat target       | `min(hi, max(lo, best+1))`                         | `min(hi, best+1)`                                                                                      | Spec formula                         |
| 6   | No-history text     | "1–2 reps in reserve"                              | "stop 2–3 reps short of failure"                                                                       | Spec text                            |
| 7   | Bodyweight          | Reps only; rep increase even in easy mode          | Reps, then "add load" at repHi; no increase in easy mode                                               | Spec §6.2                            |
| 8   | Exercise metadata   | Regexes (`/dumbbell/`, `/hanging leg raise/`)      | `exercise_alias` metadata, falling back to the dumbbell regex                                          | Data model §5                        |
| 9   | Step sizes          | Hard-coded 2.5 / 2 kg                              | `progression.weightStepKg` / `dumbbellStepKg`                                                          | Spec `PlanConfig`                    |
| 10  | e1RM                | Any rep count                                      | 1–12 reps only                                                                                         | Spec §6.2                            |
| 11  | HR warning          | Peak > cap + 5                                     | Peak > cap                                                                                             | Decision 2026-11-27                  |
| 12  | Speed insight       | Only "too fast"                                    | Above / inside / below the band, plus cadence                                                          | Spec: 2–4 insights per run           |
| 13  | Plan end            | `week` becomes 9 to mean done                      | `week` ≤ plan length, plus a `complete` flag                                                           | Spec: never advance past plan length |
| 14  | Feedback match      | By date only                                       | By `workoutId`, then date                                                                              | Two runs on one day                  |
| 15  | Repeat reason       | Generic text                                       | Names the run date and pain level                                                                      | Spec: "repeat the week and say why"  |
| 16  | "Logged today"      | Any activity today                                 | Today's _planned_ session kinds                                                                        | Spec §6.2 wording                    |
| 17  | Schedule kinds      | `lift` / `run` / `rest`                            | Adds `strength+run`                                                                                    | Spec `PlanConfig`                    |
| 18  | Hotel routine       | Free-text lines appended on lift days              | Prescribed routine (tuples) with history, replacing the gym routine                                    | Spec `PlanConfig`                    |
| 19  | Weekly volume       | Total sets / sessions / runs                       | Kept, plus working sets per muscle group with <10 / >22 flags                                          | Spec §6.2                            |
| 20  | Goals               | e1RM for any reps                                  | e1RM for ≤12 reps; load × reps above that                                                              | Follows from #10                     |
| 21  | Future data         | Only plan runs filtered by date                    | All sets and workouts after `now` are ignored                                                          | Spec: future records never count     |
| 22  | Run dedupe          | Borrows HR only                                    | Also borrows cadence, distance and duration                                                            | Merge rule, spec §4                  |
| 23  | Multiple sources    | One value per metric                               | Picks one value per day by source priority                                                             | Spec §5                              |
| 24  | Insight shape       | `{ title, text }`                                  | `{ id, severity, title, text, evidence[] }`                                                            | Spec §6.2                            |

Unchanged from the reference:

- the readiness baseline (previous 7 entries, at least 3)
- the 12:00 next-day rule and skipping rest days
- `runsPerWeek` blocks with shin repeats
- the 20-minute run dedupe window
- the "no session logged yet" insight after 10:00
- the rest-day insight
- the comparison of today's lifts with last time
