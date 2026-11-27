# Data model

The source of truth is Postgres with Drizzle (`src/lib/db/schema/`). Migrations are in `drizzle/`. SQL names are snake_case (`casing: "snake_case"`).

## Auth (Better Auth)

`user`, `session`, `account` and `verification` follow Better Auth's core schema. `user.is_demo` marks the read-only demo account. `rate_limit` stores Better Auth's database-backed limiter. `test/unit/auth-schema.test.ts` fails if Better Auth's expected fields drift from these tables.

GitHub OAuth tokens in `account` are encrypted by Better Auth (`encryptOAuthTokens`).

## App tables

Every app table has a `user_id` foreign key with `ON DELETE CASCADE`, so deleting a user removes all of their data.

| Table              | Key / uniqueness                                                                 | Notes                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_settings`    | PK `user_id`                                                                     | `time_zone` (IANA), `units`, `config` JSONB (validated by Zod `PlanConfig`), `data_version` (bumped on every write; part of the cache key, ADR 0005), `onboarding_done`                 |
| `upload_token`     | `token_hash` unique                                                              | SHA-256 of a 32-byte random token (`trn_…`), plus `last_four`, `last_used_at`. Revoked tokens keep their row (`revoked_at`). Max 10 active per user.                                    |
| `connection`       | unique (`user_id`, `provider`)                                                   | `*_enc` columns hold AES-256-GCM ciphertext, `keyId:iv:tag:data`. Hevy: `api_key_enc`, `credential_last_four`, `sync_cursor` (JSON, see below), `status` `active`/`error`/`invalid_key` |
| `daily_metric`     | PK (`user_id`, `date`, `name`, `source`)                                         | `value double precision`. One row per source; reads pick one per day by source priority.                                                                                                |
| `workout`          | unique (`user_id`, `source`, `external_id`)                                      | Index (`user_id`, `start`). `raw` is small and optional.                                                                                                                                |
| `workout_interval` | PK (`workout_id`, `idx`)                                                         | Cascades from `workout`. Scoped through its workout.                                                                                                                                    |
| `strength_set`     | unique (`user_id`, `source`, `external_id`)                                      | `performed_at` = session start (the grouping key). CSV `external_id` = `${sessionStart}\|${exercise}\|${setIndex}`                                                                      |
| `run_feedback`     | unique (`user_id`, `workout_id`), or (`user_id`, `date`) when there's no workout | Shin, calf and effort, each 0–10                                                                                                                                                        |
| `exercise_alias`   | unique (`user_id`, `raw_key`) NULLS NOT DISTINCT                                 | `user_id` null = global seed. Per-user rows override it.                                                                                                                                |
| `import_job`       | index (`user_id`, `started_at`)                                                  | Status and JSONB counts (`setsInserted`, `metricsUnchanged`, …) summed across chunks; shown as import history                                                                           |

Not user-owned: `ingest_rate_limit` (PK `key`, `window_start`, `count`), the fixed-window counters for the ingest endpoints, Hevy routes and failed-auth-per-IP. Rows older than two days are purged by the daily cron.

### Source priority for daily metrics

`manual` > `shortcut` > `hae` > `apple_health` > `demo` > anything else (alphabetical). See `src/lib/engine/metrics.ts`.

### Idempotent merges

Imports upsert on (`user_id`, `source`, `external_id`), or on the `daily_metric` primary key. A null in an incoming row never overwrites a stored value (`COALESCE(excluded.x, table.x)`). Re-importing the same file changes nothing.

## Ownership

All reads and writes of owned tables go through `scoped(userId)` (`src/lib/db/scoped.ts`):

- the `WHERE` clause always includes `user_id = $userId`
- inserts force `user_id`
- updates can't change it

`test/integration/isolation.test.ts` checks that user A can't read, update or delete user B's rows.

## Storage budget

Neon Free gives 1 GB per project. Only summaries are stored (daily rows, workout summaries, sets), never raw files. An admin page (Phase 1b) reports `pg_database_size()` and warns above 80%.

## Import merge rules (Phase 1b)

- Natural keys: `daily_metric` (user, date, name, source); `workout` and `strength_set` (user, source, external_id); `workout_interval` (workout, idx).
- Upserts use `ON CONFLICT DO UPDATE SET col = COALESCE(excluded.col, col) WHERE <any column IS DISTINCT FROM>`: a null in a later import never overwrites a stored value, and identical rows are left untouched (reported as "unchanged"). `RETURNING (xmax = 0)` distinguishes inserts from updates.
- `strength_set.exercise` is re-resolved through `exercise_alias` on every import (user aliases override global ones); unknown names are kept as typed and reported.
- Each strength session (sets sharing a start time) also creates a `workout` row of type `strength` (`external_id = session|<start>`), linked from its sets.
- Strength CSV external ids: `<session start ISO>|<alias key of exercise>|<set index>`; Strong uses the row order within the exercise because its "Set Order" can be a letter.

## Phase 2 sources

- `shortcut` (daily metrics from `POST /api/ingest/shortcut`), `hae` (both the browser upload and `POST /api/ingest/hae`; same keys, so they merge), `hevy` (Hevy API).
- Hevy set `external_id` = `<hevy workout id>|<exercise index>|<set index>`. A workout is applied as a whole: incoming values overwrite stored ones (nulls included, since the API is authoritative), sets no longer in the workout are deleted, and a `deleted` event removes the workout's sets and its session `workout` row.
- `connection.sync_cursor`: `{"mode":"full","page":n,"startedAt":…}` during the first sync (pages of `GET /v1/workouts`, 10 per page), then `{"mode":"events","since":…,"page"?:n}` (`GET /v1/workouts/events`). A sync stops before its time budget and resumes from the cursor.
- Cross-source strength duplicates (e.g. a Hevy CSV import and the Hevy API) are resolved when the store loads, not deleted: sessions from different sources starting within 2 minutes count once, by priority `hevy` > `manual` > `csv_hevy` > `csv_strong` > `csv` > `demo` (`src/lib/importers/dedupe.ts`).
