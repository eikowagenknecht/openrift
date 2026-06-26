# oRPC migration — status & end-of-migration checklist

Tracks the Hono-RPC (`@hono/zod-openapi` + `hc<AppType>`) → oRPC migration that
resolves the typecheck OOM (the chained `.route()` `AppType` graph peaks ~11.9
GB under `tsgo`). See `bench/` for the root-cause benchmark.

## Migration pattern (historical — superseded by the consolidation below)

Each endpoint:

1. Contract in `packages/shared/src/contracts/<domain>.ts` (`oc.route(...)`,
   reusing the existing Zod schemas from `response-schemas` / `schemas` — no
   schema duplication). Typed errors via `.errors({ ... })`.
2. API route reimplemented as `implement(contract).$context<ORPCContext>()`
   with a `mount<Domain>(app)` that registers `app.all(path, handle)` (+
   `requireAuth` / `etag()` Hono middleware where needed) and calls
   `handler.handle(c.req.raw, { context: { honoCtx: c } })`.
3. Removed from the chained `.route()` map in `app.ts`.
4. Web consumers switched from the `hc` client to `apiOrpcClient(contract)` /
   `browserApiOrpcClient(contract)`. 404/typed errors mapped to existing
   sentinels.
5. Route + consumer tests ported; full suites green before commit.

This pattern is deliberately migration-shaped (per-route handler + manual
mount) so oRPC coexists with the still-Hono routes. It carries intentional
structural duplication (path string in contract AND in `app.all`; repeated
`handle()` boilerplate) that the end-state pass below removes.

## END-OF-MIGRATION CONSOLIDATION — ✅ COMPLETE

Researched against oRPC docs (orpc.dev/docs/adapters/hono, /openapi). All four
items are done:

1. **Single router + single catch-all mount. ✅ DONE.** `apps/api/src/orpc/router.ts`
   assembles every domain router into one `apiRouter` served by one
   `OpenAPIHandler` (`createApiHandler(log)`); `app.ts` mounts it once via a
   single `app.all("/api/*")` catch-all registered last. All per-route `app.all`
   mounts and the duplicated path strings are gone.
2. **Native typed context + oRPC auth middleware. ✅ DONE.** `orpc/context.ts`'s
   `buildApiContext` replaces the `{ honoCtx }` bridge (built once in the
   catch-all). `orpc/base.ts`'s fail-closed `requireUser` middleware replaces the
   per-path Hono `requireAuth` (public procedures opt out via `meta.auth`; admin
   stays a Hono `requireAdmin` on the `/api/admin/v1/*` prefix). ETag /
   Cache-Control moved to `orpc/cache-policy.ts`, applied in the catch-all.
3. **OpenAPI doc from contracts. ✅ DONE.** `apps/api/src/openapi-doc.ts`
   assembles every `*Contract` export from the shared barrel into one router and
   runs `@orpc/openapi`'s `OpenAPIGenerator` (+ `@orpc/zod/zod4`'s
   `ZodToJsonSchemaConverter`; schemas are inlined, so no `components.schemas`
   $ref collisions). `app.ts`'s `/api/doc` + `/api/admin/doc` handlers build from
   that spec, overlay the cookieAuth security scheme, and split by the
   `/api/admin/` prefix. All migrated endpoints are in the docs. (Remaining
   fidelity gap: the contract ops don't carry per-operation `security: cookieAuth`
   markers — auth is still enforced by middleware; revisit if the Swagger
   affordance matters.)
4. **Delete the Hono RPC stack. ✅ DONE.** The `hc` client
   (`server-fns/api-client.ts`) and `apps/api/src/rpc-types.ts` (`AppType`) were
   removed earlier (that collapsed the typecheck OOM). `@hono/zod-openapi` itself
   is now GONE: the root app is a plain `Hono`, and the last routes on the
   stack are converted — health / sentry-tunnel / unsubscribe / list-image /
   share-images → plain Hono, `sentry-test` → a plain admin-gated throw (so the
   global `onError` still reports it to Sentry). `deck-check-ingest` is now a
   `meta: "public"` oRPC procedure too (Bearer-key auth via `context.reqHeader`;
   rate limit + 1 MB body limit stay as Hono path middleware). `openapi.ts` (`createApiApp`),
   `openapi.test.ts`, and `openapi-helpers.ts` are deleted; the dependency is off
   `apps/api/package.json`. `server-fns/api-types.ts` stays — it is now just a
   contract/shared type re-export hub, no `hc` dependency.

All consolidation is complete: the single catch-all mount (#1) and the native
typed oRPC context + fail-closed auth middleware (#2) both landed, alongside the
contract-derived docs (#3) and the removal of the Hono RPC stack (#4).

## Progress

311 / 374 endpoints migrated. Done: feature-flags, landing-summary, sets,
preferences, sitemap, init, site-settings, rules, collection-events,
collection-value-history, lists/share, copies, contact-methods, user-share,
public collections, public decks, cards, promos, deck-check-claim, public
pod-tournaments, card-trades, authenticated collections, authenticated
pod-tournaments, decks, lists, deck-check-player, deck-check, friend-groups,
and the admin taxonomy enums (art-variants, card-types, deck-formats, finishes,
super-types, domains, rarities, deck-zones, languages, markers,
distribution-channels), admin custom-tags, provider-settings, keywords,
site-settings, feature-flags (incl. per-user overrides), formats, status,
job-runs, cache, ignored-products, ignored-candidates, changelog,
printing-events, marketplace-groups, staging-card-overrides, operations,
typography-review, unified-mappings, images, rules, users, and the
read-only admin card queries (cards/queries), card bans (cards/bans), and
card images (cards/images, incl. the multipart upload — oRPC compact input
parses `multipart/form-data` with a `File` field alongside the path param),
and the ENTIRE card mutations set, incl. `upload` (candidate ingest) — its
`uploadCandidatesSchema` transform is mirrored in the contract (using
`candidateCardFieldRules` from shared) and produces the `IngestCard` shape the
ingest service consumes. The whole admin `cards/` tree (queries, bans, images,
mutations) is now oRPC; `mutations.ts` + `cards/index.ts` are deleted and the
chained `adminCardsRoute` is off the admin app. The admin set (catalog)
management is also migrated, as are the admin core reads (`me`, `cron-status`).
The web's `api-types.ts` no longer derives any type from the `hc` client — the
`Client`/`InferResponseType`/`AppType` machinery has been removed (every alias
now comes from contracts / shared interfaces).

The public `user-share` bundle reads (`/users/share/:token[/lists/:listId]`)
are migrated too (typed NOT_FOUND, viewer-aware Cache-Control set in the mount),
as are the public `catalog` and `prices` reads (the `etag()` middleware stays on
each mount; the web reads the catalog ETag with a plain `fetch`, since the SSR
cache needs the version token off the same Response as the body).

**The Hono `hc` client is GONE.** With catalog/prices migrated, the last web
consumer of `hc<AppType>` is removed: `server-fns/api-client.ts` (+ its test)
and `apps/api/src/rpc-types.ts` (`AppType`, plus the `./rpc` package export) are
deleted. This collapses the `hc<AppType>` type instantiation that drove the
typecheck OOM — the whole point of the migration.

**`@hono/zod-openapi` is GONE.** The root app is a plain `Hono`; the only
non-oRPC routes left are plain Hono — health, sentry-tunnel, unsubscribe,
list-image, share-images, and the `sentry-test` admin throw (kept plain so the
global `onError` still reports it to Sentry). `deck-check-ingest` is a public
oRPC procedure (its external error body is the native `{ code, message }`). The
OpenAPI docs are generated entirely from the contracts (#3 above). `openapi.ts`,
`openapi.test.ts`, and `openapi-helpers.ts` are deleted and the dependency is
removed from `apps/api/package.json`.

All four consolidation items are complete (#1 single catch-all mount, #2 native
typed context + fail-closed oRPC auth middleware, #3 contract-derived docs, #4
Hono RPC stack removed); none affected behavior, the OOM fix, or the docs.
