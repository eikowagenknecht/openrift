---
status: accepted
date: 2026-02-26
---

# ADR-004: Replace nuqs with TanStack Router Search Params

## Context and Problem Statement

OpenRift's `useCardFilters` hook originally used [nuqs](https://nuqs.47ng.com/) to sync all card filter state (search query, type, rarity, domain, variant, sort, view mode, etc.) to URL query strings. This gave users shareable, bookmarkable URLs that restored the exact filter configuration.

With the adoption of TanStack Router for page routing, a built-in alternative became available: TanStack Router's `validateSearch` and typed search params. These provide route-level search parameter definitions with Zod validation, type-safe `useSearch()` hooks, and `<Link search={...}>` for navigation, all without an additional dependency.

## Considered Options

- Migrate from nuqs to TanStack Router search params now
- Defer the migration
- Use shared Zod schemas as an intermediate step

## Decision Outcome

We migrate from nuqs to TanStack Router search params. The TanStack Start adoption (ADR-003) made route-level search definitions the natural fit: search params are now validated on the server during SSR, the same Zod schemas drive `validateSearch` and the loader's typed input, and filter-heavy routes beyond `/cards` (deck builder, collections) appeared as anticipated.

This is a reversal of the original 2026-02-26 verdict ("Defer the migration"). The reversal triggers from the original "what would change this decision" list are all in play: the SSR migration required route-level search params anyway, additional filter-heavy routes were added, and `useCardFilters` was already being reworked.

### Consequences

- Good, because nuqs is no longer a dependency (~3 KB gzipped).
- Good, because filter state is validated at the route boundary with `validateSearch` + Zod, so loaders see a fully-typed search object during SSR.
- Good, because the same Zod schemas now drive search-param parsing on the server, `useSearch()` hooks on the client, and `<Link search={...}>` navigation: one definition, three call sites.
- Bad, because the migration touched every component that reads or writes filter state (FilterBar, ActiveFilters, CardBrowser, etc.).
- Neutral, because URL behavior is identical from the user's perspective.

## Pros and Cons of the Options

### Migrate from nuqs to TanStack Router search params now

- Good, because all URL state (path params, search params, hash) goes through the same router API.
- Bad, because `useCardFilters` manages ~15 distinct query parameters with custom parsers, default values, and coordinated updates, so the rewrite is large.

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
