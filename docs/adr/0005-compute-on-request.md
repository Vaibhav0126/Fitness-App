# ADR 0005: Compute dashboard state on request, cached per user

- Status: accepted (2026-11-27), amended in Phase 1b (2026-11-27)

## Context

The spec asks to cache computed state per user. The state depends on `now` (the 10:00 and 12:00 rules and today's date), so a cached copy goes stale on its own. The PR #1 review asked to limit `loadEngineStore` to the last 365 days or cache per user.

## Decision

Both:

1. **Bounded store.** `loadEngineStore` loads the last 365 days of metrics, workouts, sets and feedback (extended back to `planStart` if that's older), plus the latest session of each exercise whose history is entirely older, so prescriptions and e1RM continuity still work.
2. **Per-user cache.** An in-process LRU (`src/server/cache.ts`, 200 entries) keyed by `userId : data_version : time zone : local date` holds the store, and `… : local hour` holds the computed state. Every write path (imports, manual logs, run feedback, settings, plan, demo regeneration) bumps `user_settings.data_version`. Each request reads the version from Postgres (one primary-key lookup), so invalidation is immediate on every serverless instance; the expensive load and engine run are reused within an instance.

## Consequences

- No extra table; a cold instance just recomputes.
- The cache is per instance, not shared. If profiling shows that matters, a `dashboard_cache` row keyed the same way can be added without changing callers.
