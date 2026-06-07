# Web → API direct calls (bypassing TanStack Start server functions)

> Companion to `commit-review.md`. Generated 2026-06-07.

This catalogues **every place `apps/web` talks to the API directly from the browser** — i.e. without going through a TanStack Start **server function** (`createServerFn`). For each: how it calls today, why it's a direct call, and a judgement on whether it _should_ instead be a server function.

## Background: the two ways web reaches the API

| Path                | Mechanism                                                           | Runs on                 | Network shape                    |
| ------------------- | ------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| **Server function** | `createServerFn().handler(...)` → `serverApiClient` (or `fetchApi`) | The Start server (Node) | browser → **Start server** → API |
| **Direct**          | browser `fetch` / a browser-bound `hc<AppType>`                     | The browser             | browser → **API** (same origin)  |

A server function is an RPC: on the client it compiles to a `fetch` to the Start server, which then calls the API with the forwarded SSR cookie + OTel trace. That's the right default — it keeps the API origin private, forwards auth, and gives one typed boundary. A **direct** call deliberately skips the Start hop. It's only the right tool for specific reasons:

- **Edge cache.** A public read fetched directly from the browser hits the Cloudflare edge cache (ADR-016) at the same origin. Routing it through a server function forces every request to re-enter the Start origin, which defeats the cache — the explicit reason the dual-path readers exist.
- **Cancellation.** A direct `fetch` carries a live `AbortController`, so a timeout actually cancels the in-flight request. The `createServerFn` indirection stalls indefinitely when the client can't reach the Start server.
- **Same-origin cookie.** A same-origin browser request sends the session cookie automatically — no manual forwarding.
- **SDK-managed.** Some endpoints are driven by a third-party SDK (Sentry), not app code.

As of this change, every direct call that goes through app code uses the **typed browser `hc<AppType>` client** (`browserApiClient()` in `apps/web/src/lib/server-fns/api-client.ts`) rather than a hand-written `fetch(stringPath)`, so the route and response shape are checked against the API contract. See `commit-review.md` for the rationale and the docs verification (Hono + TanStack Start).

## The direct call sites

### Public edge-cached reads (dual-path: server-fn for SSR, direct for the browser)

These three expose a `queryFn` that branches `globalThis.window === undefined ? serverFn() : fromEdge()`: SSR goes through the server function (there is no browser edge during SSR), the browser goes direct so Cloudflare serves it from the edge.

| #   | Site                                                           | Route                         | Now                                                                | Should it be a server function?                                                                                                                                                       |
| --- | -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `hooks/use-prices.ts` → `fetchPricesFromEdge`                  | `GET /api/v1/prices`          | `callApiJson(browserApiClient().api.v1.prices.$get())`             | **No.** Direct is the point — the browser path is what lands on the edge cache. A server-fn-only design would re-enter origin for every viewer and undo the prices-split caching win. |
| 2   | `lib/catalog-query.ts` → `fetchCatalogFromEdge`                | `GET /api/v1/catalog`         | `callApiJson(browserApiClient().api.v1.catalog.$get())`            | **No.** Same edge-cache rationale, and the catalog is ~310 KB — proxying it through Start per VU is exactly what the comment says they avoid.                                         |
| 3   | `lib/landing-summary-query.ts` → `fetchLandingSummaryFromEdge` | `GET /api/v1/landing-summary` | `callApiJson(browserApiClient().api.v1["landing-summary"].$get())` | **No.** Public, edge-cacheable, high-traffic landing read. Direct keeps it off origin.                                                                                                |

### Public read (browser-only, edge-cacheable)

| #   | Site                            | Route                                             | Now                                                                                 | Should it be a server function?                                                                                                                            |
| --- | ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | `hooks/use-marketplace-info.ts` | `GET /api/v1/prices/marketplace-info?printings=…` | `callApiJson(browserApiClient().api.v1.prices["marketplace-info"].$get({ query }))` | **No.** Public, `etag`-cached batch read used only on the client (deep-link URLs). Direct hits the edge; a server function would add a hop for no benefit. |

### Authenticated client read

| #   | Site                                  | Route                                                       | Now                                                                        | Should it be a server function?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `lib/copies-query.ts` → `fetchCopies` | `GET /api/v1/copies`, `GET /api/v1/collections/{id}/copies` | `callApiJson(browserApiClient()…$get({ param, query }))`, cursor-paginated | **Defensible either way — keep direct.** It's per-user (not edge-cacheable), so the edge argument doesn't apply. It's direct because the copies feed a client-side TanStack DB synced collection (optimistic add/move/dispose), so the data must live in the browser anyway, and same-origin sends the cookie automatically. A server function that paginates internally and returns one payload is a reasonable alternative; the win would be marginal (one less typed boundary) at the cost of a double-hop per refetch. Not worth churning. |

### Authenticated mutations (need cancellation)

These run entirely client-side specifically so an `AbortController` can cancel the in-flight request — the documented reason they bypass `createServerFn`.

| #   | Site                                       | Route                               | Now                                                                                       | Should it be a server function?                                                                                                                                                                                               |
| --- | ------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | `hooks/use-copies.ts` → `addCopiesApi`     | `POST /api/v1/copies`               | `callApiJson(browserApiClient().api.v1.copies.$post({ json }, { init: { signal } }))`     | **No.** Needs the live `AbortController` (a `createServerFn` write stalls when the Start server is unreachable, leaving the optimistic row stuck). This is also the call site of the `#57` regression — now typed end-to-end. |
| 7   | `hooks/use-copies.ts` → `moveCopiesApi`    | `POST /api/v1/copies/move` (204)    | `callApi(browserApiClient().api.v1.copies.move.$post({ json }, { init: { signal } }))`    | **No.** Same cancellation requirement.                                                                                                                                                                                        |
| 8   | `hooks/use-copies.ts` → `disposeCopiesApi` | `POST /api/v1/copies/dispose` (204) | `callApi(browserApiClient().api.v1.copies.dispose.$post({ json }, { init: { signal } }))` | **No.** Same cancellation requirement.                                                                                                                                                                                        |

### Infrastructure (not app data; intentionally raw)

| #   | Site                   | Route                            | Now                                                      | Should it be a server function?                                                                                                                                                                                                |
| --- | ---------------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9   | `lib/stale-bundle.ts`  | `GET /api/health` (no body read) | `globalThis.fetch("/api/health", { cache: "no-store" })` | **No.** A liveness ping for the stale-bundle update check. No body, no auth, no types — wrapping it in a server function or `hc` would add ceremony for a one-line reachability probe. Left as raw `fetch` deliberately.       |
| 10  | `lib/sentry-client.ts` | `POST /api/v1/sentry-tunnel`     | Sentry browser SDK `tunnel` option                       | **No.** Not app code — the Sentry SDK posts envelopes to this same-origin tunnel (the API proxies them to Sentry, dodging ad-blockers). It must be a direct same-origin POST by design; a server function is meaningless here. |

## Not in scope — these _do_ use server functions

For completeness, three call sites look like "direct API" at a glance but actually run **inside** `createServerFn` (browser → Start → API), so they are not direct calls:

- **`lib/auth-session.ts` → `getServerSession`** — `createServerFn` + `fetchApi` to `/api/auth/get-session`. Stays on `fetchApi` (not the typed `hc` client) because better-auth's route is a wildcard absent from the OpenAPI spec, so there's no typed path. Still a server function — correct, since it forwards the SSR cookie and is read during SSR/hydration.
- **`hooks/use-admin-image-mutations.ts` (upload-image)** — `createServerFn` + raw `fetch` (not `fetchApi`) to `…/upload-image`, because the body is `FormData` and `fetchApi` JSON-stringifies bodies. Server-side (forwards `context.cookie` to the internal `API_URL`). Correct as a server function; only the FormData transport differs.
- **`hooks/use-sentry-test.ts`** — `createServerFn` + `fetchApi`, an admin diagnostic. A server function by construction.

## Verdict

**No direct call should be converted to a server function.** Each has a concrete reason to bypass Start: edge-cache locality (1–4, 5 partially), `AbortController` cancellation (6–8), a trivial liveness probe (9), or an SDK-managed tunnel (10). The dual-path readers already use a server function for the one context where direct doesn't apply (SSR). The genuine win available here was **type safety, not architecture** — and that's now captured by routing every app-code direct call through the typed `browserApiClient()` (a wrong path or response shape is a compile error), while the architecture stays as designed.

One adjacent fix surfaced during the migration and is worth noting: the `/catalog` printing schema was missing `canonicalRank` (the handler emits it via spread and the web sorts by it), so the typed client inferred a response missing a required field. Added to `catalogPrintingResponseSchema` — behavior-neutral (the field was already on the wire; `@hono/zod-openapi` does not validate responses), and it aligns the schema with the TS types and the runtime data.
