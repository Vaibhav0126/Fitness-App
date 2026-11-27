# Train

A multi-source training dashboard and rule-based coach: strength progression, an 8-week run-walk plan and recovery (HRV, resting HR, sleep) in one place. Built with Next.js, Postgres (Neon), Drizzle and Better Auth.

> **Status:** Phase 1a (core scaffold: database, auth, coaching engine, CI). See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap. The full README (screenshots, architecture diagram, deploy guide) comes in Phase 4.

## Local setup

Requirements: **Node 24** (`nvm use`), **pnpm 9**, and a Postgres 15+ database.

```bash
pnpm install
cp .env.example .env.local          # fill in the secrets (see comments)
createdb train && createdb train_test
pnpm db:migrate                     # applies drizzle/ migrations to DATABASE_URL
pnpm dev                            # http://localhost:3000
```

Without `RESEND_API_KEY`, verification and reset emails are printed to the server console in development.

## Scripts

| Command                     | What it does                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| `pnpm test`                 | Unit tests (engine, crypto, auth schema)                           |
| `pnpm test:integration`     | DB tests (user isolation). Needs `DATABASE_URL` containing "test". |
| `pnpm typecheck`            | `next typegen` + `tsc --noEmit`                                    |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                  |
| `pnpm db:generate`          | New migration from schema changes                                  |
| `pnpm db:migrate`           | Apply migrations                                                   |

## Docs

- [Coaching engine rules and differences from the reference engine](docs/engine.md)
- [Data model](docs/data-model.md)
- [Architecture decision records](docs/adr/)

## License

MIT
