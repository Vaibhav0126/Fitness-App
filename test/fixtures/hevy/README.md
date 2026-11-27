Synthetic Hevy API responses (no real account data). Shapes follow Hevy's published
OpenAPI document (https://developers.hevy.com/openapi.json, version 0.0.1, checked
2026-11-27): `GET /v1/workouts`, `GET /v1/workouts/events`, `GET /v1/user/info`.

- `workouts-page-{1,2}.json`: 3 workouts (B, A on page 1; C on page 2), including a
  warm-up, failure and drop set, and a cardio set without reps (skipped by the importer).
- `events-page-1.json`: workout A edited (a set removed, a weight changed, an RPE cleared)
  and workout C deleted.

Replace with responses recorded from a real Pro key if the API changes shape.
