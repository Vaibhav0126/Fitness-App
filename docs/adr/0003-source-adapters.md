# ADR 0003: Generic source adapters; Strava deferred

- Status: accepted (2026-11-27)

## Context

Strava's API Policy (June 2026) requires a paid Strava subscription to create an app. New apps start at a capacity of 1 athlete (10 after a self-service upgrade). Data can be cached for at most 7 days in a transient cache, deletions must propagate within 48 hours, data can be shown only to its owner, and it may not be used in AI features. The owner has no subscription, and a 7-day cache can't serve as long-term run history.

## Decision

- Strava is **out of scope** for now.
- Importers are built around a `SourceAdapter` interface (`src/lib/importers/adapter.ts`): validate a raw row with Zod, normalize it to `NormalizedRecord`s, then merge idempotently on (`userId`, `source`, `externalId`).
- `source` is free text in the database, so adding an adapter needs no migration.
- Runs come from Health Auto Export, the Apple Health export and GPX/FIT/TCX uploads.

## Adding Strava later (optional adapter)

1. Re-verify the API Policy and the brand guidelines.
2. Store Strava data in a transient table with `fetchedAt`. A daily purge removes anything older than 7 days, and a refresh covers that window.
3. Handle the deauthorization webhook: delete tokens and data within 48 hours, and keep a deletion log to confirm.
4. Exclude `source = 'strava'`, and anything derived from it, from AI features.
5. Use "Connect with Strava" and "Powered by Strava" branding.
