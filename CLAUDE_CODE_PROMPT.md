# Build "Train": a multi-source training dashboard and coach (Next.js + Neon)

You are building a production-quality, open-source web app that I will host on my own domain and show on LinkedIn as a portfolio project. Read this whole document first. Then **write a short implementation plan and wait for my approval before writing code.** After that, work phase by phase (section 12). Stop at the end of each phase so I can review.

Where this document says "verify", check the current official docs (Next.js, Better Auth, Drizzle, Neon, Strava, Hevy). Library APIs change, so don't rely on memory.

---

## 1. Product summary

Train gathers a person's training and recovery data from several sources into one schema. It shows dashboards and gives rule-based coaching:

- **Today:** a recovery/readiness badge and insights on last night's sleep, HRV, resting heart rate and today's session.
- **Next workout:** the exact exercises, sets, reps and weights with progressive overload. For run days, the run-walk interval prescription. Everything adjusts when recovery is low.
- **Runs:** progress through the run-walk plan, per-interval pace, heart rate and cadence charts, and a shin/calf pain log that controls progression.
- **Strength:** estimated 1RM trends per exercise, progress toward goals, weekly sets per muscle group.
- **Recovery:** sleep, HRV, resting heart rate and step trends.
- **Settings:** edit the weekly schedule, routines, rep ranges, run plan, targets, trips (hotel mode) and goals; connect data sources; manage the iOS Shortcut token; export or delete all data.

It's multi-user with login. A **public demo account** with synthetic data lets recruiters try it without signing up.

## 2. Hard constraints

1. **$0/month.** Use free tiers only: Vercel Hobby, Neon Free, Resend Free, GitHub OAuth, Strava API (self-service tier, up to 10 athletes). No paid APIs. No paid native app.
2. **Privacy first.** Raw health files (the Apple Health `export.zip` / `export.xml`, GPX/FIT/CSV) are **parsed in the browser** (Web Worker). Only normalized summaries go to the server, and raw files are never stored. Encrypt third-party API keys at rest. Hash upload tokens.
3. **Vercel limits.** Request bodies must stay under ~4.5 MB, so chunk uploads (e.g. 2,000 rows per request). Functions must finish within Hobby time limits. Cron is daily only on Hobby.
4. **Neon Free:** 1 GB storage per project, and compute scales to zero. Store summaries only. Use the Neon serverless driver.
5. **Portable.** Auth and data live in my own Postgres tables. Nothing locks the app to a vendor beyond Postgres.
6. TypeScript `strict` everywhere. No `any` without a comment explaining why.

## 3. Stack

- **Next.js** (latest stable, App Router, Server Components, Server Actions, Route Handlers) + **TypeScript**
- **Neon Postgres** with **Drizzle ORM** and `@neondatabase/serverless` (verify the recommended driver for Vercel)
- **Better Auth** as a library in this codebase (not Neon's managed auth): **email/password** (with email verification and password reset) **and GitHub OAuth**, with account linking by verified email
- **Resend** for transactional email (verification, reset, optional weekly digest), sent from my domain
- **Tailwind CSS** + **shadcn/ui**; charts with **Recharts** (or visx if needed); light and dark mode
- **Zod** to validate every API input and every parsed file row
- **Vitest** (unit), **Playwright** (a few end-to-end smoke tests)
- **Vercel Cron** for daily syncs
- Browser parsing: a **Web Worker** with a streaming unzip (e.g. `fflate` or `@zip.js/zip.js`) and a streaming XML parser (e.g. `saxes`). `fit-file-parser` for FIT files. A small GPX/TCX parser.
- pnpm, ESLint, Prettier, GitHub Actions CI

## 4. Data sources and how to ingest each

All importers produce the same normalized records (section 5). Each record stores `source` and `externalId` so re-imports are **idempotent** (upsert on `(userId, source, externalId)`). Imports must merge, never wipe: when a new import has a null field and the stored record has a value, keep the stored value.

| # | Source | Mechanism | Data |
|---|---|---|---|
| 1 | **iOS Shortcut** (Apple Health daily metrics) | User copies a personal token from Settings and installs a Shortcut I'll share by iCloud link. It runs nightly via a Personal Automation and POSTs JSON to `POST /api/ingest/shortcut` with `Authorization: Bearer <token>`. | Daily: sleep hours, HRV (SDNN, ms), resting HR, steps, active energy, walking HR avg, VO2max, body weight (if present) |
| 2 | **Health Auto Export JSON** (optional; for users who own that app) | Upload a file in the browser, or the app's REST automation to `POST /api/ingest/hae` with the same token | Metrics + workouts with intervals (format in 4.2) |
| 3 | **Apple Health full export** (`export.zip`) | One-time backfill in the browser: stream-unzip and stream-parse `export.xml` in a Web Worker, aggregate per day/workout, POST in chunks to `/api/import/batch` | Daily metrics history + workouts (with WorkoutStatistics) |
| 4 | **Strava** (optional) | OAuth 2 + webhook subscription (`/api/strava/webhook`) + daily cron fallback | Runs/rides/walks: distance, moving time, avg/max HR, cadence, laps |
| 5 | **Hevy API** (Hevy Pro users) | User pastes their Hevy API key in Settings (encrypted at rest). Daily cron + "Sync now" button. | Strength workouts: exercises, sets, reps, weight, set type |
| 6 | **CSV import** (Hevy free, Strong, any app) | Browser upload, **column-mapping UI** with presets for Hevy and Strong, preview of the first 20 rows, then chunked POST | Strength sets |
| 7 | **GPX / FIT / TCX upload** | Parsed in the browser | Runs: time, distance, HR, cadence, laps |
| 8 | **Manual logger** | Form: pick a routine or exercise, log sets (weight, reps); quick-add a run | Strength sets, runs |

### 4.1 iOS Shortcut contract
- Document the exact payload in `docs/shortcut.md` and write step-by-step instructions for building the Shortcut (actions: Find Health Samples per type for the last 2 days → calculate statistics → build a Dictionary → Get Contents of URL as POST JSON).
- Note: Shortcuts' Find Health Samples has **no Workouts type**, so the Shortcut sends metrics only. Workouts come from Strava, HAE, file upload or the Apple Health export.
- Payload (versioned):
```json
{ "v": 1, "tz": "Asia/Tokyo", "days": [
  { "date": "2026-11-26", "sleepHours": 7.2, "hrvSdnnMs": 48, "restingHr": 56,
    "steps": 10432, "activeEnergyKcal": 640, "vo2max": 44.1, "weightKg": 80.1 } ] }
```
- Rate-limit this endpoint per token (e.g. 60/hour) and accept 14 days max per request.

### 4.2 Health Auto Export v2 JSON (write a parser + fixtures)
- `data.metrics[]: { name, units, data: [{ date, qty } | { date, Avg, Min, Max }] }`. Metric names include `heart_rate_variability` (SDNN ms), `resting_heart_rate`, `step_count`, `sleep_analysis` (hours from `totalSleep`, or `asleep`, or `core+deep+rem`), `active_energy`, `vo2_max`, `walking_heart_rate_average`, `weight_body_mass`.
- `data.workouts[]` with `id`, `name`, `start`, `end`, `duration`, `distance`, `heartRate`, `activities[]` (intervals). For run-walk sessions, interval index 0/1 = warm-up, then alternating run/walk, last = cool-down. All intervals have activityType "running", so classify run vs walk by speed (run if speed > walk speed + margin, configurable). Interval speed is in m/s (×3.6 → km/h). `heartRateMaximum` is sparse. Per-minute `heartRateData` and `stepCount` may exist (cadence = steps/min).
- Dates look like `"2026-11-21 6:05:47 AM +0900"`. Note the narrow no-break space (U+202F) before AM/PM. Write a robust date parser with tests.
- A later export may lack `stepCount`. Merge by workout id and keep the earlier non-null fields.

### 4.3 Apple Health `export.xml`
- Can be ~1.4 GB uncompressed, so it **must** be streamed. Never load it whole. Show a progress bar (bytes processed) and allow cancel.
- Records: `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" ...>`, `...RestingHeartRate`, `...StepCount`, `...VO2Max`, `...BodyMass`, `HKCategoryTypeIdentifierSleepAnalysis` (sum asleep stages per night; attribute a night to the wake-up date).
- `<Workout>` with nested `<WorkoutStatistics>` (distance, HR avg/max, energy). **Ignore duplicate workouts from third-party sources** (e.g. sourceName "Seconds"). Dedupe workouts that overlap more than 80% in time from different sources, preferring the source with the most fields.
- Aggregate in the worker. Send only daily rows and workout summaries.

### 4.4 Hevy
- API: `https://api.hevyapp.com/v1/...` with header `api-key: <key>`. Requires Hevy Pro. There is **no OAuth / "Log in with Hevy"**. Verify endpoints: paginated `GET /v1/workouts`, and `GET /v1/workouts/events?since=` for incremental sync (updates + deletes).
- Validate the key on save (one test request). Store it encrypted with AES-256-GCM using `ENCRYPTION_KEY` from env. Never return it to the client (show the last 4 characters only).
- Hevy CSV columns: `title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_kg, reps, distance_km, duration_seconds, rpe`. `start_time` looks like `"11 Nov 2026, 06:05"` in the user's local time zone. Warm-ups are often logged as `normal`, so treat sets under 60% of that session's top weight for the exercise as warm-ups for progression purposes.

### 4.5 Strava: follow these rules
- Self-service tier supports **up to 10 connected athletes** without review. Show "Strava slots full" gracefully when capacity is reached.
- **Strava's API policy forbids using Strava data in AI features** (prompts, embeddings, RAG), including derived data. Tag every record with `source`. The optional AI coach (Phase 5) must exclude `source = 'strava'` data and any metric derived from it.
- Verify the current API agreement on **caching/retention** and display rules. Implement whatever it requires (e.g. refresh or purge cached activity data on schedule). Show Strava data only to the athlete who owns it. Handle the deauthorization webhook by deleting that user's Strava tokens and data.
- Show "Powered by Strava" / "Connect with Strava" branding per their guidelines.
- Lifting sessions synced to Strava have no sets/reps, so ignore Strava `WeightTraining` activities when Hevy/CSV data exists for the same time window.

## 5. Data model (Drizzle, Postgres)

Better Auth tables (user, session, account, verification) are generated per its Drizzle adapter. App tables (all have `userId` FK with `onDelete: cascade`, plus `createdAt`/`updatedAt`):

- `user_settings`: `userId` PK, `timeZone` (IANA), `units` (metric/imperial), `config` JSONB (validated by a Zod `PlanConfig` schema, section 6), `onboardingDone`
- `upload_token`: `id`, `userId`, `name`, `tokenHash` (SHA-256), `lastFour`, `lastUsedAt`, `revokedAt`
- `connection`: `userId`, `provider` (`strava`|`hevy`), encrypted credentials (`accessToken`, `refreshToken`, `expiresAt`, or `apiKey`), `externalAthleteId`, `lastSyncAt`, `status`, `lastError`
- `daily_metric`: `userId`, `date` (date), `name` (enum: sleep_hours, hrv_sdnn_ms, resting_hr, steps, active_energy_kcal, vo2max, weight_kg, walking_hr_avg), `value` numeric, `source`. **Unique (userId, date, name, source)**. Have a view/query that picks one value per day by source priority.
- `workout`: `id`, `userId`, `source`, `externalId`, `type` (run, walk, ride, strength, other), `start`, `end`, `durationS`, `distanceM`, `avgHr`, `maxHr`, `avgCadence`, `avgSpeedKmh`, `energyKcal`, `name`, `raw` JSONB (small, optional). **Unique (userId, source, externalId)**
- `workout_interval`: `workoutId`, `idx`, `kind` (warmup, run, walk, cooldown), `start`, `durationS`, `distanceM`, `avgSpeedKmh`, `avgHr`, `maxHr`, `cadence`
- `strength_set`: `id`, `userId`, `workoutId` (nullable, link to a `workout` row of type strength), `source`, `externalId`, `sessionTitle`, `performedAt`, `exercise` (normalized name), `exerciseRaw`, `setIndex`, `setType`, `weightKg`, `reps`, `rpe`. **Unique (userId, source, externalId)** where externalId = `${sessionStart}|${exercise}|${setIndex}` for CSV
- `run_feedback`: `userId`, `workoutId` or `date`, `shinPain` 0–10, `calfPain` 0–10, `effort` 0–10, `note`
- `exercise_alias`: map raw names to canonical names (global seed + per-user overrides), plus `muscleGroup`, `isDumbbell`, `isBodyweight`
- `import_job`: `id`, `userId`, `kind`, `status`, `counts` JSONB, `error`, timestamps (shown on an "Imports" page)

Index on `(userId, date)` / `(userId, start)`. Add a storage-usage check (`pg_database_size`) to an admin page and warn above 80% of 1 GB.

## 6. Coaching engine (pure TypeScript, no I/O)

Put it in `src/lib/engine/`. It's pure, deterministic and fully unit-tested. `computeState(store, config, now) → DashboardState`. All date logic uses the user's IANA `timeZone` via `Intl` (no fixed offsets).

### 6.1 `PlanConfig` (Zod)
```ts
{
  timeZone: string,
  planStart: string,                      // ISO date the run plan started
  schedule: Record<"0".."6", { kind: "strength"|"run"|"strength+run"|"rest", routine?: string }>,
  routines: Record<string, Array<[exercise: string, sets: number, repLo: number, repHi: number]>>,
  hotelRoutine: Array<[string, number, number, number]>,
  trips: Array<{ from: string, to: string, label: string }>,   // use hotelRoutine on these dates
  runPlan: Array<{ week: number, reps: number, runS: number, walkS: number, note?: string }>,
  runTargets: { speedKmhMin: number, speedKmhMax: number, hrCap: number, cadenceMin: number, cadenceMax: number },
  progression: { weightStepKg: 2.5, dumbbellStepKg: 2, shinMax: 3, runsPerWeek: 2 },
  keyLifts: string[],
  goals: Array<{ exercise: string, weightKg?: number, reps: number }>
}
```

### 6.2 Rules
- **Readiness:** compare today to the mean of the previous 7 entries. Flags: HRV ≤ −15%, resting HR ≥ +5 bpm, sleep < 6 h. 0 flags = good, 1 = ok, 2+ = low. Missing data → "unknown", never "low".
- **Strength prescription per exercise** (from the last session containing it, using working sets only):
  - If every working set's reps ≥ `repHi`: add weight (`weightStepKg`, or `dumbbellStepKg` for dumbbell exercises) and reset to `repLo`.
  - Otherwise: same weight, target reps = min(`repHi`, best set reps + 1).
  - Bodyweight exercises progress by reps, then suggest adding load.
  - Readiness low → "easy mode": one set fewer, same weight, no increase.
  - No history → "find a working weight: start light, stop 2–3 reps short of failure".
- **Run plan progression:** count completed runs on or after `planStart` and on or before today. Every `runsPerWeek` runs advance one week **unless** any run in that week had shin pain > `shinMax`. If so, repeat the week and say why. Never advance past the plan length. Future-dated records must never count.
- **Run analysis:** per run, classify intervals, compare run speed to target band, HR to cap, cadence to band. Produce 2–4 plain-English insights ("Run intervals averaged 8.1 km/h, inside your 7.5–8.5 target. HR peaked at 158, above your 150 cap, so slow the last two reps").
- **Next workout:** if today's planned session is already logged, or local time ≥ 12:00, show tomorrow's. Skip rest days. On trip dates use `hotelRoutine`.
- **Weekly volume:** working sets per muscle group per ISO week. Flag groups under 10 or over 22 sets.
- **e1RM:** Epley `w × (1 + reps/30)` for reps ≤ 12. Show the trend and goal progress percent.
- Every insight is `{ id, severity: "info"|"good"|"warn", title, text, evidence: string[] }`, so the UI can show "why".

Port these from my existing tested JavaScript engine if I provide it (`reference/engine.js`). Keep the behaviour identical and write the tests first.

## 7. Pages (App Router)

- `/` landing page: hero, feature grid, architecture diagram, "Try the demo" button, GitHub link
- `/login`, `/signup`, `/verify`, `/reset-password`
- `/app` **Today**: readiness badge, insights, today's session, last run summary
- `/app/next`: next workout prescription (printable/mobile-friendly checklist)
- `/app/runs`: plan progress (week X of 8), runs table, interval chart for the selected run (speed bars colored by kind with the target band shaded, HR line with the cap line), feedback form (shin/calf/effort sliders)
- `/app/strength`: exercise picker → e1RM and top-set chart; key-lifts table with goal progress; weekly sets per muscle group
- `/app/recovery`: HRV, resting HR, sleep and steps charts with 7-day rolling averages
- `/app/log`: manual logger
- `/app/import`: Apple Health backfill, HAE file, CSV (with mapping), GPX/FIT/TCX; import history
- `/app/settings`: profile, time zone, units; plan editor (schedule, routines, run plan, targets, trips, goals) with a JSON "advanced" view; connections (Strava, Hevy); Shortcut tokens (create/revoke, copy, setup guide); export all data (JSON zip); delete account
- `/demo`: signs in as a read-only demo user. Block all writes for that user server-side.

Mobile first: I'll mostly use this on my iPhone at the gym. Add it as a PWA (manifest, icons, offline shell for `/app/next`).

Chart rules: "nice" tick steps (1/2/2.5/5 × 10ⁿ) with decimals when step < 1, last x-label not clipped, accessible colors in light and dark mode, tooltips, empty states.

## 8. API routes

- `POST /api/ingest/shortcut`, `POST /api/ingest/hae`: Bearer upload token
- `POST /api/import/batch`: session auth; body `{ kind, rows[] }` ≤ 2,000 rows; returns counts
- `GET /api/strava/connect`, `GET /api/strava/callback`, `GET|POST /api/strava/webhook` (subscription validation + events)
- `POST /api/hevy/key`, `POST /api/hevy/sync`
- `GET /api/cron/daily`: protected by `CRON_SECRET`. Syncs Hevy and Strava for each connected user (batched, resumable, respects rate limits), then recomputes cached state.
- `GET /api/export`, `DELETE /api/account`

Use Server Actions for form mutations inside the app. Validate everything with Zod. Rate-limit public endpoints (a simple Postgres-backed limiter is fine, since Redis isn't free).

## 9. Security and privacy

- Better Auth: secure cookies, CSRF protection, email verification required before syncs, password rules, account linking only by verified email.
- Upload tokens: random 32 bytes, shown once, stored as SHA-256, revocable.
- Encryption: AES-256-GCM for third-party credentials. Rotate-able `ENCRYPTION_KEY`.
- Row-level ownership checks in every query (a helper that always scopes by `userId`). Add a test that user A can't read user B's data.
- No raw health files on the server. No analytics trackers. Privacy page explaining what is stored.
- Secrets only in env vars. Ship `.env.example` with: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ENCRYPTION_KEY`, `CRON_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `APP_URL`.

## 10. Seed and demo data

- `pnpm db:seed` creates the canonical exercise aliases and the demo user with **synthetic** data: 12 weeks of 4-day upper/lower lifting with realistic progression, 2 run-walk sessions per week following the plan, daily metrics with noise, one bad-recovery week, one trip.
- The default `PlanConfig` for new users is a template "Upper/Lower 4-day + 8-week run-walk". Use the routines below as the template, and let users pick "start from scratch".

Template routines ([exercise, sets, repLo, repHi]):
- **Lower A:** Squat (Barbell) 3,5,8 · Leg Press (Machine) 2,10,12 · Seated Leg Curl (Machine) 2,12,15 · Leg Extension (Machine) 2,12,15 · Standing Calf Raise (Barbell) 2,12,16 · Tibialis Raise 3,15,25 · Seated Calf Raise 3,15,20
- **Upper A:** Bench Press (Barbell) 3,5,8 · Pull Up (Weighted) 3,6,10 · Shoulder Press (Dumbbell) 2,8,12 · Seated Cable Row - V Grip (Cable) 2,10,12 · Lateral Raise (Dumbbell) 2,15,20 · Triceps Rope Pushdown 2,12,15 · Seated Incline Curl (Dumbbell) 2,12,15 · Cable Crunch 3,15,20
- **Lower B:** Romanian Deadlift (Smith Machine) 3,8,10 · Bulgarian Split Squat (Dumbbell) 2,8,10 · Seated Leg Curl (Machine) 2,10,12 · Leg Extension (Machine) 2,12,15 · Calf Press (Machine) 2,15,20 · Tibialis Raise 3,15,25 · Seated Calf Raise 3,15,20
- **Upper B:** Incline Bench Press (Dumbbell) 3,8,12 · Lat Pulldown (Cable) 3,8,10 · Chest Supported Incline Row (Dumbbell) 2,10,12 · Cable Fly Crossovers 2,12,15 · Rear Delt Reverse Fly (Machine) 2,12,15 · Overhead Triceps Extension (Cable) 2,12,15 · Preacher Curl (Barbell) 2,10,12 · Hanging Leg Raise 3,15,20

Template run plan (8 weeks, reps × run/walk): W1 8×1:00/2:00 · W2 8×1:30/2:00 · W3 6×2:00/1:30 · W4 6×2:00/2:00 (easier week) · W5 5×3:00/1:30 · W6 4×4:00/1:00 · W7 3×7:00/1:00 · W8 2×10:00/1:00, then 20 min continuous.
Run targets: 7.5–8.5 km/h, HR cap 150, cadence 165–175.

## 11. Quality bar (this is a portfolio piece)

- **Tests:** unit tests for every parser (with small fixture files in `test/fixtures/`, including the U+202F date edge case and the stepCount-missing merge case) and for every engine rule. Integration tests for import idempotency and user isolation. Playwright smoke test: sign up → import CSV fixture → see the next workout.
- **CI:** GitHub Actions runs typecheck, lint, unit tests and build on every PR. Use Neon branching for a preview DB if it's easy; otherwise use a local Postgres service container.
- **README:** what it is, a screenshot/GIF, live demo link, an architecture diagram (Mermaid: sources → importers → normalized schema → engine → UI), data-flow and privacy explanation, tech stack, local setup, env vars, deploy guide (Vercel + Neon + GitHub OAuth app + Resend domain + Strava app + cron), and "design decisions" (why browser parsing, why rule-based coaching, Strava constraints).
- `docs/`: `shortcut.md`, `data-model.md`, `engine.md` (rules with examples), `adr/` (short architecture decision records).
- Accessibility: keyboard navigable, labeled form controls, color contrast AA.
- Performance: dashboard pages are Server Components, cache computed state per user and invalidate on import, Lighthouse ≥ 90 on mobile.

## 12. Phases and acceptance criteria

**Phase 0: plan.** Propose the folder structure, key libraries (with versions you verified), and anything in this spec you think is wrong or risky. Wait for my OK.

**Phase 1: core.**
- Repo scaffold, Tailwind/shadcn, Drizzle + Neon, migrations
- Better Auth (email/password + verification + reset via Resend, GitHub OAuth)
- Settings with plan editor, engine + tests, CSV import (Hevy/Strong presets + mapping), manual logger
- Today / Next / Strength / Runs / Recovery pages
- Demo user + seed, CI
- *Done when:* I can sign up, import my Hevy CSV, see correct next-workout prescriptions, and the demo works logged out.

**Phase 2: automatic data.**
- Upload tokens + Shortcut endpoint + `docs/shortcut.md`
- HAE JSON import/endpoint with interval charts
- Hevy API key sync + daily cron
- Strava OAuth + webhook + compliance items
- *Done when:* a nightly Shortcut POST updates Today, and a new Hevy or Strava workout appears without manual steps.

**Phase 3: Apple Health backfill and files.**
- Web Worker streaming import of `export.zip` with progress/cancel, dedupe
- GPX/FIT/TCX upload
- *Done when:* a 75 MB zip imports in the browser without freezing the tab, and the server never receives the raw file.

**Phase 4: polish.** Landing page, README + diagram, screenshots, PWA, accessibility pass, Lighthouse, Playwright, privacy page, export/delete account.

**Phase 5 (optional): AI coach, bring your own key.** The user stores their own Anthropic/OpenAI key (encrypted). A weekly summary is generated from non-Strava data only. The rule-based coach stays the default. Weekly email digest via Resend.

## 13. How to work

- Small, focused commits with clear messages. One phase per branch/PR.
- Before adding any dependency, check it's maintained and needed.
- When something in this spec conflicts with current docs or terms of service, tell me and propose an alternative. Don't silently deviate.
- Don't put my personal data, emails or API keys in the repo. Use synthetic fixtures only.
- At the end of each phase, give me: what was built, how to run it, what I need to set up manually (accounts, env vars), and known gaps.
