# ADR 0005: Compute dashboard state on request

- Status: accepted (2026-11-27)

## Context

The spec asks to cache computed state per user. The state depends on `now` (the 12:00 next-day rule and today's date), so a cached copy goes stale on its own.

## Decision

Compute on each request: the pure engine is fast, and React `cache` dedupes the queries within a render. `user_settings.data_version` exists so a `dashboard_cache` row (keyed by user, local date and data version) can be added if profiling or Lighthouse shows a need.
