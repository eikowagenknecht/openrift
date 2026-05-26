---
status: accepted
date: 2026-05-26
---

# Caching layers

## Context and Problem Statement

Responses pass through the app (Hono API or TanStack Start SSR), Docker nginx, host nginx, and Cloudflare. Any of those can set `Cache-Control`. We need a clear rule for who sets it, and we need to decide what and how Cloudflare caches.

## Decision Outcome

**Edge-Caching is steered by per-route headers at origin.** Each response sets its own `Cache-Control`:

- Hashed assets (`/assets/`, `/media/`): Docker nginx, `public, immutable` for 1 year.
- Unhashed images: Docker nginx, 30 days with `stale-while-revalidate=604800` (7 days).
- SSR HTML: `apps/web/src/lib/page-cache.ts` — `public, max-age=300` (5 min), `stale-while-revalidate=3600` (1 hour) for anonymous GETs on an allowlist, `private, no-cache` otherwise.
- API responses: each route in `apps/api/src/routes/public/*.ts`. Stable data (catalog, sets, cards, prices) is `max-age=3600` (1 hour) + `stale-while-revalidate=86400` (24 hours); mutable lists (collections, decks) are `max-age=60` (1 min) + `stale-while-revalidate=300` (5 min); health is `no-store`.

The catch-all `location /` in `nginx/web.conf` deliberately sets no `Cache-Control` — when both nginx and the app set it, the values comma-join and Cloudflare misreads the result. We hit this once and the edge got stuck in `UPDATING`.

**Cloudflare layer for HTML:**

- Anonymous visitor: Cloudflare caches at the edge using the origin's `Cache-Control`, then rewrites the response header to `no-cache` before sending it to the client. Edge cache yes, browser cache no.
- Authenticated visitor (session cookie present): Cloudflare bypasses the edge cache entirely. Every request hits origin and the origin's `private, no-cache` header passes through.

**Cloudflare layer for everything else** (API, assets, images): honors origin headers as-is, both for edge and for the client.

Forcing the client to `no-cache` for HTML means there's no browser-side cache to wait out on deploy — purging Cloudflare's edge is sufficient to roll a new version to every anonymous visitor on the next request. The app's `public, max-age=300, stale-while-revalidate=3600` on anonymous HTML is therefore an instruction to Cloudflare, not to the browser. The `private, no-cache` on authenticated HTML stops the browser from caching personalized content — Cloudflare passes the bypassed response through unchanged, so the origin header is what the client sees.

## Consequences

- Anonymous HTML is served from the edge, so most traffic doesn't hit the origin SSR.
- Authenticated requests always hit origin — fine, since they're personalized and a minority of traffic.
- Deploys include a Cloudflare purge step.
- API endpoints without an explicit `Cache-Control` fall through to Cloudflare's default heuristic. Nothing enforces that a new route sets one.

## Confirmation

- `apps/web/src/lib/page-cache.test.ts` covers the public/private split and the no-stacking guard.
- Several API route tests assert their `Cache-Control` header (e.g. `catalog.test.ts`, `collections.test.ts`, `health.test.ts`), but this isn't enforced across all routes.
- `curl -sI https://openrift.app/api/v1/catalog` should report `cf-cache-status: HIT` once warm. `curl -sI https://openrift.app/cards` (anonymous) should report `HIT` on the edge but `Cache-Control: no-cache` to the client. The same with a session cookie should report `cf-cache-status: BYPASS`.
