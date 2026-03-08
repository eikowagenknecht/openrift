---
status: rejected
date: 2026-02-26
---

# ADR-004: Replace nuqs with TanStack Router Search Params

## Context and Problem Statement

OpenRift's `useCardFilters` hook currently uses [nuqs](https://nuqs.47ng.com/) to sync all card filter state (search query, type, rarity, domain, variant, sort, view mode, etc.) to URL query strings. This gives users shareable, bookmarkable URLs that restore the exact filter configuration.

With the adoption of TanStack Router for page routing, there is now a built-in alternative: TanStack Router's `validateSearch` and typed search params. These provide route-level search parameter definitions with Zod validation, type-safe `useSearch()` hooks, and `<Link search={...}>` for navigation — all without an additional dependency.

## Decision Drivers

- nuqs works well and integrates cleanly via its TanStack Router adapter
- TanStack Router search params would remove one dependency (~3 KB gzipped)
- `useCardFilters` manages ~15 distinct query parameters — migration is large
- URL behavior is identical either way — no user-visible benefit

## Considered Options

- Migrate from nuqs to TanStack Router search params now
- Defer the migration
- Use shared Zod schemas as an intermediate step

## Decision Outcome

Chosen option: "Defer the migration", because nuqs works well, integrates cleanly via its TanStack Router adapter, and the migration effort is not justified by the benefits.

**nuqs is battle-tested for this use case.** It handles serialization, parsing, defaults, shallow updates, and history mode (push vs. replace) out of the box. Reimplementing all of this with raw router search params would be significant work with no user-facing improvement.

**The adapter pattern eliminates the integration concern.** Since nuqs provides a first-party TanStack Router adapter, there is no friction between the two libraries. They share the same URL source of truth.

**The migration is mechanical but large.** `useCardFilters` manages ~15 distinct query parameters with custom parsers, default values, and coordinated updates. Moving this to `validateSearch` is straightforward in concept but touches many files and introduces regression risk.

### Consequences

- Good, because nuqs remains the filter state manager — no migration effort or regression risk.
- Good, because the `nuqs/adapters/tanstack-router` adapter integrates cleanly with TanStack Router.
- Neutral, because this decision should be revisited when a natural rewrite opportunity arises or when additional filter-heavy routes are added.

### What would change this decision

- A major filter system rewrite (e.g., saved filter presets, multi-route filters) that would rework `useCardFilters` anyway.
- nuqs maintenance concern — if the library becomes unmaintained or the adapter breaks with newer TanStack Router versions.
- Multiple filter-heavy routes (e.g., deck builder, collection manager) where route-level search param definitions become more natural.

## Pros and Cons of the Options

### Migrate from nuqs to TanStack Router search params now

- Good, because it removes one dependency (~3 KB gzipped).
- Good, because search params are defined at the route level with `validateSearch`, giving TypeScript the exact shape at compile time.
- Good, because all URL state (path params, search params, hash) goes through the same router API.
- Bad, because `useCardFilters` manages ~15 distinct query parameters with custom parsers, default values, and coordinated updates — the rewrite is large.
- Bad, because every component that reads or writes filter state (FilterBar, ActiveFilters, CardBrowser, etc.) must change.
- Bad, because it adds scope and risk with no user-facing benefit.

### Defer the migration

- Good, because nuqs handles serialization, parsing, defaults, shallow updates, and history mode out of the box.
- Good, because the first-party TanStack Router adapter eliminates integration friction.
- Good, because no regression risk from rewriting filter state management.
- Bad, because nuqs remains an additional dependency.

### Use shared Zod schemas as an intermediate step

Define filter schemas once with Zod, then use them for both nuqs parsers and `validateSearch`.

- Good, because it prepares for an incremental migration to router search params.
- Good, because Zod schemas can be reused across both systems.
- Neutral, because it's not needed yet but could be useful if the migration is attempted later.
- Bad, because it adds complexity without immediate benefit.
