# ADR 0006: Hevy sync with a personal API key, events for increments

- Status: accepted (2026-11-27, Phase 2)

## Context

The spec (§4.4) says Hevy has no OAuth and is used through a personal API key (Hevy Pro), with `GET /v1/workouts` for history and `GET /v1/workouts/events?since=` for updates and deletes.

Hevy's developer site (developers.hevy.com, OpenAPI document version 0.0.1, checked 2026-11-27) now documents:

- the same `api-key` header and endpoints. `pageSize` is at most **10** for both lists, and events come newest first, as `{type:"updated", workout}` or `{type:"deleted", id, deleted_at}`;
- `GET /v1/user/info` with `is_pro`, a cheap way to validate a key;
- rate limits of 1,000 requests per 5 minutes per IP. A 429 has an empty body and no `Retry-After`. Hevy also asks scheduled syncs to use a random minute;
- **new since the spec:** OAuth 2 apps (authorize at `hevy.com/oauth/authorize`, token at `hevy.com/api/token`, scopes such as `read-workout`) and webhooks (`workout.created`, signed with `Hevy-Signature`). An approved OAuth integration doesn't need its users to have Hevy Pro, but the app has to pass Hevy's review ("Hevy Labs").

## Decision

- **Keep the personal API key, as the spec says.** It's the self-serve path and needs no review. The client (`src/lib/integrations/hevy/client.ts`) sits behind a `HevyApi` interface with Zod-validated responses, so an OAuth token source can be added later without touching the sync.
- **Sync is resumable and whole-workout.** The first sync pages `/v1/workouts`, then moves to events `since` the moment it started (minus 5 minutes of overlap). The cursor is stored on `connection.sync_cursor`, and each run stops before its deadline. A workout's sets overwrite the stored ones (the API is authoritative, so nulls overwrite too), sets missing from an update are deleted, and `deleted` events remove the sets and the session row.
- **No webhooks yet.** The daily cron plus "Sync now" meets the Phase 2 bar ("appears without manual steps", daily). A webhook receiver that triggers an incremental sync is a small follow-up if you want near-real-time updates.

## Consequences

- Users need Hevy Pro for the key. Hevy Free users keep using the CSV import, and sessions imported both ways count once (`src/lib/importers/dedupe.ts`).
- Tests use synthetic fixtures shaped like the OpenAPI document (`test/fixtures/hevy/`). They should be replaced with recorded responses from a real key if the shape drifts.
