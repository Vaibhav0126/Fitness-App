# Train: Phase 0 implementation plan

Status: **approved 2026-11-27** (decisions in §5). Written 2026-11-27. Versions are from the npm registry as of today; platform facts come from the vendors' current docs (sources at the end).

## 1. Verified versions

| Area            | Package                                                      | Version               | Notes                                                                                                                                      |
| --------------- | ------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime         | Node.js                                                      | **24 LTS** (24.22.x)  | Your local Node is 20.18. Vitest 5 needs ≥22.12 and ESLint 10 needs ≥20.19, so you need to upgrade. I'll pin it in `.nvmrc` and `engines`. |
| Framework       | next                                                         | 16.4.6                | App Router, Server Actions, Route Handlers                                                                                                 |
|                 | react / react-dom                                            | 19.3.1                |                                                                                                                                            |
| Language        | typescript                                                   | **6.0.3** (not 7.0.2) | See risk R1                                                                                                                                |
| DB              | drizzle-orm / drizzle-kit                                    | 0.45.4 / 0.31.11      | 1.0 is still RC. Use the stable release.                                                                                                   |
|                 | pg                                                           | 8.23.1                | Neon's current guidance for Vercel Fluid. See risk R2.                                                                                     |
|                 | @vercel/functions                                            | 3.11.4                | `attachDatabasePool`                                                                                                                       |
| Auth            | better-auth                                                  | 1.7.28                | I'll check in Phase 1 which schema generator CLI is current. `@better-auth/cli` looks stale at 1.4.21.                                     |
| Email           | resend                                                       | 6.40.1                |                                                                                                                                            |
| UI              | tailwindcss                                                  | 4.3.5                 | shadcn CLI 4.23.1                                                                                                                          |
| Charts          | recharts                                                     | 3.11.1                | Lazy-loaded on the client                                                                                                                  |
| Validation      | zod                                                          | 4.6.7                 |                                                                                                                                            |
| Tests           | vitest / @playwright/test                                    | 5.1.2 / 1.65.1        |                                                                                                                                            |
| Browser parsing | @zip.js/zip.js                                               | 2.25.0                | Chosen over fflate: streaming plus Zip64 for very large exports                                                                            |
|                 | saxes                                                        | 6.0.0                 | Last release was 2022, but it's stable and has one small dependency. I'll benchmark it against a line scanner in Phase 3.                  |
|                 | fit-file-parser                                              | 6.2.10                | Maintained (Nov 2026)                                                                                                                      |
| Tooling         | eslint 10.15 + typescript-eslint 8.74, prettier 3.10, pnpm 9 |                       |                                                                                                                                            |

Every new dependency gets the "maintained and needed" check before I add it (spec §13).

## 2. Folder structure

```
.
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/            page.tsx (landing), privacy/
│  │  ├─ (auth)/                 login, signup, verify, reset-password
│  │  ├─ demo/route.ts           signs in as the read-only demo user
│  │  ├─ app/                    layout (auth guard), page (Today), next/, runs/, strength/,
│  │  │                          recovery/, log/, import/, settings/, admin/
│  │  ├─ api/
│  │  │  ├─ auth/[...all]/       Better Auth handler
│  │  │  ├─ ingest/shortcut, ingest/hae
│  │  │  ├─ import/batch
│  │  │  ├─ strava/connect, callback, webhook
│  │  │  ├─ hevy/key, hevy/sync
│  │  │  ├─ cron/daily, export, account
│  │  ├─ manifest.ts, sw (public/sw.js)
│  ├─ components/                ui/ (shadcn), charts/, forms/
│  ├─ lib/
│  │  ├─ engine/                 pure: config.ts (Zod PlanConfig), readiness.ts, strength.ts,
│  │  │                          runs.ts, next.ts, volume.ts, dates.ts (Intl/IANA), index.ts (computeState)
│  │  ├─ parsers/                pure and isomorphic: hae.ts, hevy-csv.ts, strong-csv.ts, gpx.ts, tcx.ts,
│  │  │                          fit.ts, apple-health/ (sax handlers + aggregators), dates.ts
│  │  ├─ importers/              server: normalize → idempotent merge-upsert per record type
│  │  ├─ db/                     client.ts, schema/ (auth.ts, app.ts), scoped.ts (userId-scoped query helper)
│  │  ├─ auth/                   better-auth config, session helpers, demo guard
│  │  ├─ crypto.ts               AES-256-GCM with key versioning; token hashing
│  │  ├─ rate-limit.ts           Postgres fixed-window limiter
│  │  ├─ integrations/           strava/, hevy/
│  │  └─ email/                  Resend + templates
│  ├─ workers/                   apple-health.worker.ts, file-import.worker.ts
│  └─ server/                    actions/ (Server Actions), queries/ (load store for engine)
├─ drizzle/                      SQL migrations
├─ scripts/seed.ts               aliases + synthetic demo user
├─ test/                         fixtures/ (synthetic only), unit/, integration/, e2e/
├─ docs/                         shortcut.md, data-model.md, engine.md, adr/
├─ reference/engine.js           (existing, kept as the behavioural oracle)
└─ .github/workflows/ci.yml
```

## 3. Risks and places where the spec needs changing

**R1. TypeScript 7 isn't ready for this toolchain.** typescript-eslint 8.74 has peer `typescript <6.1`. TS 7 also has no JS compiler API until 7.1, so Next needs the experimental `useTypeScriptCli` flag. → Use **TS 6.0.3** and move to 7.x once typescript-eslint supports it.

**R2. Database driver.** Neon and Vercel now recommend **`pg` with a pool plus `attachDatabasePool`** on Vercel Fluid compute, not `@neondatabase/serverless` (Neon suggests that one for platforms without pooling). `pg` also runs against a plain Postgres in CI and locally, so it's more portable (spec §2.5). → Use `drizzle-orm/node-postgres` everywhere. This deviates from spec §2.4 and §3, so I need your OK.

**R3. Strava: the spec is out of date (API Policy, June 2026).**

- New apps start in **Single Player Mode (capacity 1)**. A self-service upgrade in the dashboard raises it to 10. More than that needs review, with no SLA.
- **A Strava subscription is required to create an app.** Standard-tier apps "are subject to subscription requirements … the developer or specified end users maintain an active Strava subscription". This may break the $0 rule if you don't already subscribe.
- **Cache limit is 7 days** (§6.2), user deletions must propagate within 48 h (§6.3), and full deletion happens within 30 days of revoke, with written confirmation on request (§7.4, §2.5). The data must also live in a "transient cache", not a persistent index (§5.5).
- Data may be shown **only to the athlete who owns it**. Strava data must never reach AI features, even when derived (§5.3).
- **Consequence:** Strava can't be a long-term history source. → Proposal: Strava rows go in a separate table with a `fetchedAt` column. The daily cron re-fetches the last 7 days and hard-deletes anything older. Persistent run history comes from HAE, Apple Health or files. Run-plan progress still counts Strava runs while they're cached. The UI says why Strava history only goes back 7 days. The demo never contains Strava-shaped data. I'd also move Strava to the **end of Phase 2 behind a feature flag**, so the rest isn't blocked if you skip it.

**R4. iOS Shortcut and locked-device Health data.** iOS encrypts Health data while the phone is locked, so a 3 a.m. automation often reads nothing. → In `docs/shortcut.md`, recommend triggers like "When alarm is stopped" or a morning time. The endpoint upserts a 2-day window, so late runs fill gaps. Summing sleep stages in Shortcuts is fiddly, so I'll document an exact action recipe.

**R5. The engine spec and `reference/engine.js` differ.** Spec §6 says to keep behaviour "identical", but it also states rules the reference doesn't implement. Proposal: **wherever spec §6 is explicit, the spec wins; otherwise the reference wins.** Each difference gets a test and a line in `docs/engine.md`:

| #   | reference/engine.js                            | Spec §6                                            | Proposal                                                                                                                      |
| --- | ---------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| a   | Baseline needs ≥3 prior entries within 30 days | "mean of previous 7 entries"                       | Previous ≤7 entries, **minimum 3**, else no baseline                                                                          |
| b   | `good` if any metric exists with no flags      | missing data → `unknown`                           | `unknown` unless at least 2 of the 3 signals have today's value _and_ a baseline                                              |
| c   | Progression on **top-weight** sets only        | "every **working** set" (warm-ups are <60% of top) | Exclude warm-ups. Then require reps ≥ repHi on every set at the top weight, so lighter back-off sets don't block progression. |
| d   | Rep target clamped to ≥ repLo                  | `min(repHi, best+1)`                               | Keep the clamp: `min(hi, max(lo, best+1))`                                                                                    |
| e   | No-history text "1–2 reps in reserve"          | "stop 2–3 reps short"                              | Spec text                                                                                                                     |
| f   | Bodyweight: reps only                          | reps, then suggest adding load                     | Spec                                                                                                                          |
| g   | e1RM for any reps                              | Epley only for reps ≤12                            | Spec                                                                                                                          |
| h   | HR warning at cap **+5**                       | example warns at cap                               | Spec, plus an optional `hrTolerance` field (default 0)                                                                        |
| i   | Fixed `tzOffsetMin`                            | IANA via `Intl`                                    | Spec                                                                                                                          |
| j   | Schedule kinds `lift/run/rest`                 | adds `strength+run`                                | Spec: the Next page shows both blocks                                                                                         |
| k   | `hotelRoutine` is free-text strings            | tuples                                             | Spec (tuples), with a `note` string per trip kept from the reference                                                          |
| l   | Weekly volume: total sets                      | per muscle group, flag <10 or >22                  | Spec, plus keep the reference's sessions/runs weekly table                                                                    |
| m   | Runs dedupe by start time within 20 min        | Apple Health dedupe at >80% overlap                | Both: 80% overlap at import, 20-min guard in the engine                                                                       |

**R6. `daily_metric.value numeric`.** Drizzle returns `numeric` as a string. → Use `double precision`.

**R7. The demo data goes stale.** Synthetic data seeded once gets older every day, so "Today" ends up empty. → The daily cron regenerates the demo user's data anchored to today (deterministic seed), and the demo user is blocked from writes server-side.

**R8. "Cache computed state per user".** The state depends on `now` (the noon rule, today's date), so a cached result goes stale on its own. → Phase 1 computes on request: the engine is pure and fast, and the cost is the queries, which I'll dedupe with React `cache()`. I'll add a `dashboard_cache` row (keyed by user, local date and data version, bumped on import) only if Lighthouse or profiling shows it's needed. That works the same on any Postgres host.

**R9. Vercel Hobby (verified):** 4.5 MB request body (413 above that), **300 s** max duration with Fluid, cron at most once a day with ±59 min precision. Vercel calls cron jobs "legacy, migrating to Schedules", so I'll check at Phase 2. Hobby is non-commercial only, which is fine for a portfolio project.

**R10. Neon Free (verified Nov 2026):** 1 GB storage per project, 100 CU-hours per month, writes fail at the cap. Matches the spec. The admin page warns at 80%. Admin access is set by a new env var, `ADMIN_EMAILS`.

**R11. Hevy API is unverified.** The docs page renders client-side, so I couldn't confirm the endpoints, `pageSize` max, the events response shape or the rate limits. Third-party specs also disagree on the base URL (`api.hevyapp.com` vs `hevy.com/api`). → Verify in Phase 2 against a real Pro key (yours). The client is isolated behind a Zod-validated interface.

**R12. Phase 1 is very large.** → Split it into **1a** (scaffold, DB, auth, engine + tests, CI) and **1b** (settings/plan editor, CSV import, logger, five pages, seed/demo), with a review stop after each.

Smaller items:

- Better Auth's own rate limiter can use DB storage for auth routes. My Postgres limiter covers the ingest routes.
- Use `noUncheckedIndexedAccess` with `strict`.
- `ENCRYPTION_KEY` rotation: ciphertext is prefixed with a key id (`v1:`), with `ENCRYPTION_KEY_PREVIOUS` for re-encryption.
- PWA: `app/manifest.ts` plus a small hand-written service worker (no plugin) caching the shell and the last `/app/next` HTML.
- CI uses a Postgres 17 service container. Neon branching is skipped (it needs an API key secret, and the container is enough).
- I'll check Resend free-tier limits and domain verification steps in Phase 1.

## 4. Phase plan

- **1a (done, PR #1):** pnpm scaffold, strict TS, ESLint/Prettier, Tailwind and shadcn, Drizzle schema and migrations, `pg` client, Better Auth (email/password, verification, reset via Resend, GitHub OAuth, linking by verified email), `scoped()` helper and isolation test, engine ported test-first (a reference-parity suite plus tests for each R5 difference), CI.
- **1b (done):** onboarding; settings and plan editor (form plus JSON view); CSV import (Hevy and Strong presets, mapping, 20-row preview, chunked batch) and HAE v2 file upload (parsed in a Web Worker); idempotent merge-upserts with import history; manual logger and run feedback; Today/Next/Strength/Runs/Recovery pages with SVG charts; seed and demo; JSON export and account deletion; a 365-day store window plus a per-user cache (ADR 0005); a Playwright smoke test in CI. Moved forward from later phases: the HAE file parser (2), Playwright and export/delete (4). Deferred: imperial display.
- **2:** tokens and Shortcut endpoint with docs, HAE push endpoint (`/api/ingest/hae`, reusing the 1b parser and merge), Hevy key and sync, cron, then Strava (feature-flagged, per R3).
- **3:** Apple Health worker import (progress, cancel, dedupe), GPX/FIT/TCX.
- **4:** landing page, README and diagrams, PWA, accessibility, Lighthouse, more Playwright coverage, privacy page, imperial units display.
- **5 (optional):** bring-your-own-key AI coach on non-Strava data, weekly digest.

## 5. Decisions (approved 2026-11-27)

1. **DB driver:** `pg` + `attachDatabasePool` via `drizzle-orm/node-postgres`.
2. **TypeScript 6.0.3.** TODO: move to 7.x when typescript-eslint supports it.
3. **Strava is out of scope** (no paid subscription). Importers use a generic source-adapter interface, so Strava can be added later as an optional adapter (see ADR). Runs come from Health Auto Export, the Apple Health export and GPX/FIT/TCX uploads.
4. **Engine:** the spec wins wherever it's explicit. Readiness with missing data is `unknown`. Progression uses **all working sets** (warm-ups = under 60% of that session's top weight). The HR warning triggers **at the cap**. Every difference from `reference/engine.js` is recorded in `docs/engine.md`.
5. **Phase 1 is split** into 1a and 1b.
6. **Node 24 LTS:** `.nvmrc`, `engines`, and pinned in CI and on Vercel.
7. The Shortcut runs in the **morning** ("When alarm is stopped", or at a set time). Metric values use `double precision`. The daily cron regenerates the demo data.

## Sources

- Neon Free plan: https://neon.com/faqs/free-plan-limits-and-quotas, https://neon.com/docs/introduction/plans
- Neon on Vercel: https://neon.com/docs/guides/vercel-connection-methods, https://neon.com/docs/connect/choose-connection
- Vercel limits: https://vercel.com/docs/functions/limitations, https://vercel.com/docs/plans/hobby, https://vercel.com/docs/cron-jobs/usage-and-pricing
- Strava: https://www.strava.com/legal/api_policy, https://developers.strava.com/docs/getting-started/, https://developers.strava.com/docs/rate-limits/, https://developers.strava.com/guidelines/
- TypeScript 7 and tooling: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli
- Hevy (unverified): https://api.hevyapp.com/docs
