# ADR 0001: `pg` with `attachDatabasePool` instead of `@neondatabase/serverless`

- Status: accepted (2026-11-27)

## Context

The spec suggested the Neon serverless driver. As of Nov 2026, Neon's and Vercel's docs recommend a standard TCP connection with a pool (`pg`) on Vercel Fluid compute, with `attachDatabasePool` from `@vercel/functions` releasing idle clients before an instance is suspended. Neon recommends its serverless driver for platforms that can't pool connections.

## Decision

Use `drizzle-orm/node-postgres` + `pg` everywhere (`src/lib/db/client.ts`), and call `attachDatabasePool(pool)` when running on Vercel.

## Consequences

- The same driver works against Neon, a local Postgres and the CI service container, so nothing is tied to Neon beyond Postgres (spec §2.5).
- Interactive transactions work, which the HTTP driver doesn't support.
- `DATABASE_URL` should be Neon's **pooled** connection string in production.
