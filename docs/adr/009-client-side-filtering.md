---
status: accepted
date: 2026-03-10
---

# ADR-009: Client-Side Filtering and Full-Dataset Fetch

## Context and Problem Statement

The card browser fetches all cards and prices in two requests (`GET /api/cards`, `GET /api/prices`), then filters, sorts, and virtualizes entirely on the client. As the Riftbound card pool grows with future set releases, should we move filtering and pagination to the server, or keep the current client-side approach?

## Decision Drivers

- Riftbound currently has ~664 cards across 3 sets — a small dataset
- Filter interactions must feel instant; round-tripping to the server on every keystroke adds latency
- The app targets mobile devices with limited memory and bandwidth
- Shared filter types in `packages/shared` already support both client and server use

## Considered Options

- Keep client-side filtering with full-dataset fetch (current approach)
- Move to server-side filtering with cursor/offset pagination

## Decision Outcome

Chosen option: "Keep client-side filtering with full-dataset fetch", because the dataset is small enough that the entire payload fits comfortably in memory and over the wire, and client-side filtering provides a noticeably better UX with zero-latency filter responses.

### Consequences

- Good, because filter changes are instant — no loading states, no debouncing, no network dependency.
- Good, because the architecture is simple — one fetch, one cache, no query invalidation on filter changes.
- Good, because shareable URLs work via `nuqs` query params without server cooperation.
- Bad, because this approach will not scale indefinitely; revisit when thresholds below are crossed.

## When to Revisit

Re-evaluate this decision when **any** of these hold:

| Signal | Threshold | How to measure |
|---|---|---|
| Card count | > 5,000 printings | `SELECT count(*) FROM printings` |
| JSON payload size | > 1 MB gzipped | Check `Content-Length` / network tab |
| Client filter time | > 50 ms per pass | `performance.mark` around `filterCards()` |
| Initial load (3G) | > 3 s for cards request | Lighthouse / WebPageTest on throttled connection |

## Migration Path (When Thresholds Are Crossed)

1. Add `WHERE`/`ORDER BY`/`LIMIT`+`OFFSET` (or keyset pagination) to `GET /api/cards`, driven by the existing `CardFilters` type from `packages/shared`.
2. Replace `useQuery` with `useInfiniteQuery` in `useCards`, fetching pages as the virtualizer scrolls.
3. Debounce or defer filter params before sending to the server (200–300 ms).
4. Keep `filterCards()` in `packages/shared` — it can still be used for optimistic client-side pre-filtering while the server response is in flight.

## Pros and Cons of the Options

### Client-side filtering (current)

- Good, because zero-latency filtering — `filterCards()` runs synchronously in ~1 ms for the current dataset.
- Good, because `useDeferredValue` keeps the filter UI responsive even if the grid re-render is slow.
- Good, because offline-capable after initial load; no network needed for filter changes.
- Bad, because payload and memory cost grow linearly with card count.
- Bad, because every client re-does work the server could do once.

### Server-side filtering with pagination

- Good, because payload size stays constant regardless of total card count.
- Good, because the server can use DB indexes for fast filtered queries.
- Bad, because every filter change requires a network round-trip, adding latency and loading states.
- Bad, because significantly more complex — cache invalidation, infinite scroll coordination, debouncing, optimistic updates.
- Bad, because shareable URLs need the server to understand the same filter vocabulary (already possible via shared types, but still more moving parts).
