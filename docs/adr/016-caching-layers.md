---
status: accepted
date: 2026-05-26
---

# ADR-016: Caching layers

## Context and Problem Statement

Responses pass through the app (Hono API or TanStack Start SSR), Docker nginx, host nginx, and Cloudflare. Any of those can set `Cache-Control`. We need a clear rule for who sets it, and we need to decide what and how Cloudflare caches.

## Decision Outcome

**Edge-Caching is steered by per-route headers at origin.** Each response sets its own `Cache-Control`:

- Hashed assets (`/assets/`, `/media/`): Docker nginx, `public, immutable` for 1 year.
- Unhashed images: Docker nginx, 30 days with `stale-while-revalidate=604800` (7 days).
- SSR HTML: `apps/web/src/lib/page-cache.ts` sets `public, max-age=300` (5 min), `stale-while-revalidate=3600` (1 hour) for anonymous GETs on an allowlist, `private, no-cache` otherwise.
- API responses: each route in `apps/api/src/routes/public/*.ts`. Stable data (catalog, sets, cards, prices) is `max-age=3600` (1 hour) + `stale-while-revalidate=86400` (24 hours); mutable lists (collections, decks) are `max-age=60` (1 min) + `stale-while-revalidate=300` (5 min); health is `no-store`.

The catch-all `location /` in `nginx/web.conf` deliberately sets no `Cache-Control`: when both nginx and the app set it, the values comma-join and Cloudflare misreads the result. We hit this once and the edge got stuck in `UPDATING`.

**Cloudflare layer for HTML:**

- Anonymous visitor: Cloudflare caches at the edge using the origin's `Cache-Control`, then rewrites the response header to `no-cache` before sending it to the client. Edge cache yes, browser cache no.
- Authenticated visitor (session cookie present): Cloudflare bypasses the edge cache entirely. Every request hits origin and the origin's `private, no-cache` header passes through.

**Cloudflare layer for everything else** (API, assets, images): honors origin headers as-is, both for edge and for the client.

Forcing the client to `no-cache` for HTML means there's no browser-side cache to wait out on deploy: purging Cloudflare's edge is sufficient to roll a new version to every anonymous visitor on the next request. The app's `public, max-age=300, stale-while-revalidate=3600` on anonymous HTML is therefore an instruction to Cloudflare, not to the browser. The `private, no-cache` on authenticated HTML stops the browser from caching personalized content. Cloudflare passes the bypassed response through unchanged, so the origin header is what the client sees.

**Version headers split by cacheability** (`apps/api/src/middleware/version-headers.ts`): every `/api` response carries exactly one of two headers, read by the client's stale-bundle watcher in `apps/web/src/lib/stale-bundle.ts`. The rule: a header on a cacheable response must describe the body, never the server that sent it.

- `X-Build-Id` (the deployed commit hash) goes only on responses no cache may reuse (`no-store`, or no `Cache-Control` at all). API responses, unlike HTML, keep their `public, max-age` for the browser, so the browser replays them locally after a deploy for up to their `max-age`, and no purge can reach that copy. A replayed response still stamped with the previous build's id false-trips the watcher: every recently active user got a "new version available" prompt loop for up to an hour after each release (2026-07-08). Staleness detection loses nothing, since every page load also produces `no-store` traffic (health ping, authenticated reads, mutations). The client applies the same rule when reading: a build id on a cacheable response is ignored, which covers bodies cached before the server stopped stamping them and any future stamping leak.
- `X-Api-Format` (the global payload format version, `API_FORMAT_VERSION` in `packages/shared/src/contracts/api-format.ts`) goes only on cacheable responses. It describes the body's shape, so a cached copy stays truthful across deploys, like `Content-Type`. The client compares it against the version baked into its bundle: an older body (a cache replayed a pre-format-change payload) is transparently refetched once with `cache: "no-store"`; a newer body (stale bundle) feeds the regular new-version prompt instead of a parse error. The constant must be bumped in the same commit as any breaking shape change to a cacheable contract's response. This matters for the payloads the browser fetches and parses directly (catalog, prices, marketplace-info, price history, landing-summary); endpoints consumed only through server functions (init, rules, cards, sets) have no browser-cache exposure because the SSR server is always the deployed build.

## Consequences

- Anonymous HTML is served from the edge, so most traffic doesn't hit the origin SSR.
- Authenticated requests always hit origin, which is fine since they're personalized and a minority of traffic.
- Deploys include a targeted Cloudflare purge step (HTML shells + `/api/` by prefix, host-scoped). Hashed `/assets/` and `/media/` are never purged: content-addressed URLs can't go stale, and keeping them warm avoids cold-cache page loads after a release.
- API endpoints without an explicit `Cache-Control` fall through to Cloudflare's default heuristic. Nothing enforces that a new route sets one.

## Confirmation

- `apps/web/src/lib/page-cache.test.ts` covers the public/private split and the no-stacking guard.
- `apps/api/src/middleware/version-headers.test.ts` covers the header split (build id on `no-store`, format version on cacheable); `apps/web/src/lib/stale-bundle.test.ts` covers the client-side loop guard against a cache-served stale build id and the format-mismatch refetch/prompt paths.
- Several API route tests assert their `Cache-Control` header (e.g. `catalog.test.ts`, `collections.test.ts`, `health.test.ts`), but this isn't enforced across all routes.
- `curl -sI https://openrift.app/api/v1/catalog` should report `cf-cache-status: HIT` once warm. `curl -sI https://openrift.app/cards` (anonymous) should report `HIT` on the edge but `Cache-Control: no-cache` to the client. The same with a session cookie should report `cf-cache-status: BYPASS`.
