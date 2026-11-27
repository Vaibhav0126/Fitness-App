# ADR 0004: Pure rule-based engine, tested against the reference

- Status: accepted (2026-11-27)

## Context

Coaching must be explainable, deterministic and free to run. An existing JavaScript engine (`reference/engine.js`) encodes rules the owner already trusts, but the spec changes some of them.

## Decision

- `src/lib/engine/` is pure TypeScript: `computeState(store, config, now)`, with no I/O and no clock.
- Every insight carries `evidence[]`, so the UI can show "why".
- Where the spec is explicit, the spec wins; otherwise the reference behaviour is kept. Each difference is listed in `docs/engine.md`.
- `test/unit/engine/parity.test.ts` runs both engines on scenarios where they should agree.
- An LLM coach (Phase 5) stays optional and never replaces the rules.
