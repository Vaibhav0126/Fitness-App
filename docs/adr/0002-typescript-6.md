# ADR 0002: TypeScript 6.0, ESLint 9, Node 24

- Status: accepted (2026-11-27)

## Context

- TypeScript 7.0 (the native port) is the npm `latest`, but typescript-eslint 8.x has a peer range of `typescript <6.1`. TS 7 also has no JS compiler API until 7.1, so Next.js needs the experimental `useTypeScriptCli` flag.
- ESLint 10 is out, but the plugins bundled by `eslint-config-next` 16.4 (`import`, `react`, `jsx-a11y`) still declare `eslint ≤9` peers.
- Vitest 5 needs Node ≥ 22.12.

## Decision

- TypeScript **6.0.3** with `strict` and `noUncheckedIndexedAccess`. **TODO:** move to TS 7.x once typescript-eslint supports it.
- ESLint **9** with flat config. Move to 10 when `eslint-config-next`'s plugins support it.
- Node **24 LTS**, pinned in `.nvmrc`, `engines` (`24.x`, which Vercel honours) and CI.
