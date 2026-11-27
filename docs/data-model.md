# Data model

The source of truth is Postgres with Drizzle (`src/lib/db/schema/`). Migrations are in `drizzle/`. SQL names are snake_case (`casing: "snake_case"`).

## Auth (Better Auth)

`user`, `session`, `account` and `verification` follow Better Auth's core schema. `user.is_demo` marks the read-only demo account. `rate_limit` stores Better Auth's database-backed limiter. `test/unit/auth-schema.test.ts` fails if Better Auth's expected fields drift from these tables.

GitHub OAuth tokens in `account` are encrypted by Better Auth (`encryptOAuthTokens`).

## App tables

Every app table has a `user_id` foreign key with `ON DELETE CASCADE`, so deleting a user removes all of their data.

| Table              | Key / uniqueness                                                                 | Notes                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `user_settings`    | PK `user_id`                                                                     | `time_zone` (IANA), `units`, `config` JSONB (validated by Zod `PlanConfig`), `data_version` (bumped on import)     |
| `upload_token`     | `token_hash` unique                                                              | SHA-256 of a 32-byte random token, plus `last_four`. Revocable.                                                    |
| `connection`       | unique (`user_id`, `provider`)                                                   | `*_enc` columns hold AES-256-GCM ciphertext, `keyId:iv:tag:data`                                                   |
| `daily_metric`     | PK (`user_id`, `date`, `name`, `source`)                                         | `value double precision`. One row per source; reads pick one per day by source priority.                           |
| `workout`          | unique (`user_id`, `source`, `external_id`)                                      | Index (`user_id`, `start`). `raw` is small and optional.                                                           |
| `workout_interval` | PK (`workout_id`, `idx`)                                                         | Cascades from `workout`. Scoped through its workout.                                                               |
| `strength_set`     | unique (`user_id`, `source`, `external_id`)                                      | `performed_at` = session start (the grouping key). CSV `external_id` = `${sessionStart}\|${exercise}\|${setIndex}` |
| `run_feedback`     | unique (`user_id`, `workout_id`), or (`user_id`, `date`) when there's no workout | Shin, calf and effort, each 0–10                                                                                   |
| `exercise_alias`   | unique (`user_id`, `raw_key`) NULLS NOT DISTINCT                                 | `user_id` null = global seed. Per-user rows override it.                                                           |
| `import_job`       | index (`user_id`, `started_at`)                                                  | Status and counts for the Imports page                                                                             |

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
