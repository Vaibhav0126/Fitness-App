# Health Auto Export → Train (REST API automation)

[Health Auto Export](https://www.healthyapps.dev/) (HAE; paid iOS app) can push Apple Health metrics **and workouts with run-walk intervals** to Train on a schedule. It uses the same parser and merge rules as the browser upload (Import → Health Auto Export), so automatic pushes and manual file uploads of the same data merge into the same rows.

Settings below follow HAE's help page "Sync Apple Health Data to REST API" (last updated 2026-10-31).

## Set up

1. In Train: **Settings → Connections → Upload tokens → Create token** (e.g. "Health Auto Export"). Copy the token and the **Health Auto Export** endpoint, `https://<your-app>/api/ingest/hae`.
2. In HAE: **Export → Automated → New Automation**. Each automation sends one data type, so create two.

### Automation 1: Health Metrics

| Setting         | Value                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automation Type | REST API                                                                                                                                                       |
| URL             | `https://<your-app>/api/ingest/hae`                                                                                                                            |
| HTTP Headers    | `Authorization` = `Bearer trn_…your token…`                                                                                                                    |
| Data Type       | Health Metrics: Heart Rate Variability, Resting Heart Rate, Sleep Analysis, Step Count, Active Energy, VO2 Max, Weight & Body Mass, Walking Heart Rate Average |
| Export Format   | JSON                                                                                                                                                           |
| Export Version  | Version 2                                                                                                                                                      |
| Date Range      | **Default** (yesterday + today)                                                                                                                                |
| Summarize Data  | **On**, Time Grouping **Day**                                                                                                                                  |
| Batch Requests  | On                                                                                                                                                             |
| Sync Frequency  | e.g. every 2 hours                                                                                                                                             |

### Automation 2: Workouts

Same URL and header. Data Type **Workouts**, JSON, Version 2, **Include Workout Metrics** on (heart rate and steps per minute give interval HR and cadence), Time Grouping **Minutes**, **Include Route Data** off (Train doesn't use routes, and they make requests large). Date Range **Default** or **Previous 7 Days**.

Use **Manual Upload** (Export Existing Data) once with a start date a few months back to backfill.

## Why these settings

- **Use Day grouping with Default or Today, never Since Last Sync.** Train stores one value per metric per day and replaces it on each push. A "since last sync" window would send only part of today, and that partial total would replace the fuller one sent earlier.
- **Keep requests small.** Train accepts up to **4 MB per request** (Vercel's limit is 4.5 MB). Batch Requests keeps each request small, and route data is the usual cause of oversized bodies (413).
- **Rate limit.** Up to 120 requests an hour per token. Each request is merged on its own and is idempotent: re-sending the same day or workout reports it as unchanged.
- **Locked phone.** HAE can only read Health data while the iPhone is unlocked. Background runs are best-effort (Background App Refresh on, Low Power Mode off); the next unlocked run catches up.

## Responses

`200 {"ok":true,"counts":{…},"rejected":[],"skipped":[],"unknownMetrics":[]}`. Errors: `400` (not HAE JSON), `401` (bad or revoked token), `403` (demo or unverified account), `413` (over 4 MB), `429` (rate limit). HAE's **View Activity Logs** shows each run's status.
