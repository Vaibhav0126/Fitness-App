# Train

A multi-source training dashboard and rule-based coach: strength progression, an 8-week run-walk plan and recovery (HRV, resting HR, sleep) in one place. Built with Next.js, Postgres (Neon), Drizzle and Better Auth.

> **Status:** Phase 2 (automatic data: iOS Shortcut, Health Auto Export push, Hevy API sync, daily cron; Strava deferred). See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap. The full README (screenshots, architecture diagram, deploy guide) comes in Phase 4.

## Local setup

Requirements: **Node 24** (`nvm use`), **pnpm 9**, and a Postgres 15+ database.

```bash
pnpm install
cp .env.example .env.local          # fill in the secrets (see comments)
createdb train && createdb train_test
pnpm db:migrate                     # applies drizzle/ migrations to DATABASE_URL (reads .env.local)
pnpm db:seed                        # exercise aliases + the read-only demo user
pnpm dev                            # http://localhost:3000
```

Without `RESEND_API_KEY`, verification and reset emails are printed to the server console in development: copy the link from the terminal to verify your account. Open <http://localhost:3000/demo> to look around as the demo user (12 weeks of synthetic data, read-only).

## Importing your data

Everything is parsed **in your browser**; only normalized rows are sent to the server, and raw files are never stored. Re-importing the same file is safe: rows are matched on their natural key, a blank value never overwrites one you already have, and the import history shows new / updated / unchanged counts.

1. **Sign up, verify, onboard.** Pick the template (Upper/Lower 4-day + 8-week run-walk) or start from scratch, and confirm your time zone. Times in CSV files are read in this zone.
2. **Strength (Hevy).** In Hevy: Profile → Settings → Export & Import Data → Export workouts. In Train: Import → Strength CSV → pick the file. The Hevy preset is detected (kg or lb); check the 20-row preview and click Import.
3. **Strength (Strong or anything else).** Strong's export (Settings → Export Strong Data) is detected too. For other apps, map the columns yourself: session start, exercise and reps are required; one row per set.
4. **Health (Health Auto Export).** In the HAE iOS app, create a manual export: format **JSON**, version **v2**, with _Health Metrics_ (HRV, resting heart rate, sleep analysis, step count, active energy, VO2 max, weight, walking HR) and/or _Workouts_ (enable route/heart-rate/step data so run-walk intervals can be computed). AirDrop or save `Metrics.json` / `Workouts.json`, then Import → Health Auto Export → select both files.
5. **Anything else.** Log a strength session or quick-add a run at **Log**, and rate shin/calf pain and effort on each run (Today prompts you; Runs has it per run). Shin pain over your limit repeats the run-plan week.
6. **Plan.** Settings → Plan edits the schedule, routines (sets and rep ranges), run plan, targets, trips (hotel routine), goals and key lifts, with an Advanced (JSON) view. Settings → Data exports everything as JSON or deletes your account.

### Automatic sync (Phase 2)

- **iOS Shortcut (free):** daily sleep, HRV, resting HR, steps and active energy from Apple Health every morning. Create an upload token in **Settings → Connections**, then follow [`docs/shortcut.md`](docs/shortcut.md).
- **Health Auto Export push:** the same parser as the file upload, run by HAE's REST API automation. See [`docs/health-auto-export.md`](docs/health-auto-export.md).
- **Hevy API (Hevy Pro):** paste your key in **Settings → Connections → Hevy**. Train checks it with one request, stores it encrypted (only the last 4 characters are shown), runs a first full sync, and then syncs changes and deletes daily and on **Sync now**. A session also imported from a Hevy CSV is counted once.
- **Daily cron:** `vercel.json` calls `GET /api/cron/daily` once a day (Hobby allows one run a day, within the hour). It needs `CRON_SECRET` set in Vercel, and it also refreshes the demo data. Locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/daily`.

Exercise names are matched to a built-in catalog (muscle group, dumbbell/bodyweight) so volume and weight steps work; names it doesn't know are kept as typed and listed after the import.

## Scripts

| Command                     | What it does                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                 | Unit tests (engine, crypto, auth schema)                                                                                                               |
| `pnpm test:integration`     | DB tests (isolation, import idempotency, ingest endpoints, tokens, Hevy sync, cron, demo seed). Needs `DATABASE_URL` containing "test".                |
| `pnpm test:e2e`             | Playwright smoke test against `pnpm build` output. Uses `E2E_DATABASE_URL` (a migrated _test_ DB). First run: `pnpm exec playwright install chromium`. |
| `pnpm db:seed`              | Exercise aliases + demo user (idempotent; regenerates the demo for today)                                                                              |
| `pnpm typecheck`            | `next typegen` + `tsc --noEmit`                                                                                                                        |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                                                                                                      |
| `pnpm db:generate`          | New migration from schema changes                                                                                                                      |
| `pnpm db:migrate`           | Apply migrations                                                                                                                                       |

## Docs

- [Coaching engine rules and differences from the reference engine](docs/engine.md)
- [Data model](docs/data-model.md)
- [iOS Shortcut setup and payload](docs/shortcut.md)
- [Health Auto Export REST automation](docs/health-auto-export.md)
- [Architecture decision records](docs/adr/)

## License

MIT
