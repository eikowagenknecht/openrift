# ADR-003: Evaluate Migrating from nuqs to TanStack Router Search Params

**Date:** 2026-02-26
**Status:** Proposed (deferred)
**Deciders:** @eiko

## Context

OpenRift's `useCardFilters` hook currently uses [nuqs](https://nuqs.47ng.com/) to sync all card filter state (search query, type, rarity, domain, variant, sort, view mode, etc.) to URL query strings. This gives users shareable, bookmarkable URLs that restore the exact filter configuration.

With the adoption of TanStack Router for page routing, there is now a built-in alternative: TanStack Router's `validateSearch` and typed search params. These provide route-level search parameter definitions with Zod validation, type-safe `useSearch()` hooks, and `<Link search={...}>` for navigation — all without an additional dependency.

### What TanStack Router search params would give us

- **One fewer dependency** — nuqs could be removed entirely, reducing bundle size (~3 KB gzipped) and the dependency surface.
- **Deeper type integration** — search params are defined at the route level with `validateSearch`, so TypeScript knows the exact shape of every route's query string at compile time. No manual parser/serializer definitions.
- **Collocated route config** — filter state lives alongside route definitions, making it easier to reason about what each route accepts.
- **Consistent API** — all URL state (path params, search params, hash) goes through the same router API.

### What the migration would cost

- **Rewrite of `useCardFilters`** — the hook is the central filter state manager. Every filter, sort option, and view mode parameter would need to move from nuqs parsers to `validateSearch` schemas and `useNavigate({ search })` calls.
- **Component-level changes** — any component that reads or writes filter state (FilterBar, ActiveFilters, CardBrowser, etc.) would need to switch from `useQueryState` / `useQueryStates` to `useSearch` / `useNavigate`.
- **nuqs adapter works well** — nuqs provides a `nuqs/adapters/tanstack-router` adapter that integrates cleanly with TanStack Router. The two libraries coexist without conflict.
- **Risk for no user-visible benefit** — the URL behavior is identical either way. Users would see no difference.

## Decision

**Defer the migration.** nuqs works well, integrates cleanly via its TanStack Router adapter, and the migration effort is not justified by the benefits.

### Rationale

**nuqs is battle-tested for this use case.** It handles serialization, parsing, defaults, shallow updates, and history mode (push vs. replace) out of the box. Reimplementing all of this with raw router search params would be significant work with no user-facing improvement.

**The adapter pattern eliminates the integration concern.** Since nuqs provides a first-party TanStack Router adapter, there is no friction between the two libraries. They share the same URL source of truth.

**The migration is mechanical but large.** `useCardFilters` manages ~15 distinct query parameters with custom parsers, default values, and coordinated updates. Moving this to `validateSearch` is straightforward in concept but touches many files and introduces regression risk.

### What would change this decision

- **A major filter system rewrite** — if `useCardFilters` needs to be substantially reworked for a new feature (e.g., saved filter presets, multi-route filters), that would be a natural opportunity to switch to router search params.
- **nuqs maintenance concern** — if the library becomes unmaintained or the adapter stops working with newer TanStack Router versions.
- **Multiple filter-heavy routes** — if new routes (e.g., deck builder, collection manager) each need their own filter state, defining search params at the route level may become more natural than sharing nuqs hooks.

## Alternatives Considered

### Migrate immediately

Rewrite `useCardFilters` to use `validateSearch` and `useSearch` now, while the router migration is happening.

**Rejected** because it adds scope and risk to the routing migration without user-facing benefit. Better to keep the routing migration focused and migrate filter state later.

### Use Zod schemas shared between nuqs and router

Define filter schemas once with Zod, then use them for both nuqs parsers and `validateSearch`.

**Not needed yet** but could be a useful intermediate step if we decide to migrate incrementally — start with Zod schemas, then swap the underlying implementation from nuqs to router search params.

## Consequences

- nuqs remains the filter state manager for `useCardFilters`.
- The `nuqs/adapters/tanstack-router` adapter is used to integrate with TanStack Router.
- This decision should be revisited when a natural rewrite opportunity arises or when additional filter-heavy routes are added.
