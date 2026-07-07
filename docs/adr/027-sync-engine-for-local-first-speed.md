---
status: accepted
date: 2026-06-12
---

# ADR-027: Sync Engine for Local-First Speed

## Context and Problem Statement

The goal is to be the **fastest app in this domain**. The means is eliminating network roundtrips from the interaction path: when every read is answered from a local store, navigation and filtering are instant regardless of connection quality. Offline capability falls out of that architecture as a welcome side effect, not as a goal in itself. At the same time, SSR for SEO is non-negotiable, so crawlers must keep receiving full HTML.

A sync engine replaces request/response data fetching with a continuously replicated subset of the database on the client. Reads become instant local queries, writes apply optimistically and reconcile in the background, and the network becomes an async transport instead of a blocking dependency. That is the architecture behind Linear, Figma, and similar apps.

TanStack DB is the **client half** of that architecture: collections (typed local stores), live queries (incrementally maintained via differential dataflow, sub-millisecond updates on 100k rows), and transactional optimistic mutations. It is deliberately backend-agnostic: a collection can be fed by TanStack Query (what we do today) or by a real sync engine. Important context: TanStack DB is built **by the ElectricSQL team** (Kyle Mathews, Sam Willis) in partnership with TanStack, so Electric is the de-facto blessed sync engine and the canonical example throughout the docs. PowerSync is an official TanStack partner with its own collection adapter. Official adapters as of mid-2026: Query, Electric, PowerSync, TrailBase, RxDB, plus localStorage/localOnly.

Where we stand: we are already on the on-ramp. `apps/web` uses `queryCollectionOptions` for collection copies (optimistic insert/move/dispose against the Hono API) and a `localOnlyCollectionOptions` collection for deck drafts, all behind `useHydrated()`. We have zero offline infrastructure today: no service worker, no manifest, no IndexedDB.

### TanStack DB 0.6 (March 2026): the development that makes this feasible

Until spring 2026, TanStack DB collections were in-memory only and "offline" was roadmap. [0.6](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes) shipped both missing pieces:

- **Persistence**: `persistedCollectionOptions()` wraps any collection with a SQLite-WASM store in the browser (`@tanstack/browser-db-sqlite-persistence`), so synced data survives reloads and the app restarts without re-fetching.
- **Offline writes**: `@tanstack/offline-transactions`, a durable mutation outbox (IndexedDB-backed) with FIFO replay, retry with backoff, and multi-tab leader election. Mutations made offline survive a browser restart and replay when back online.

Two honest caveats: the persistence adapters are roughly 11 weeks old (0.2.0), and **TanStack DB still has no SSR story**. That is the explicitly named blocker before v1 (the team put out a call for SSR design partners). `useLiveQuery` still has no server snapshot, which is exactly why our `useHydrated()` convention exists. The library is still labeled beta (core 0.6.8 as of this writing).

## Decision Drivers

- **Speed above all.** No network roundtrip on any read after initial sync; interactions answered from a local store. Offline reads/writes are a side effect we take, not a requirement we engineer for.
- SSR for SEO must keep working. Crawlers get full HTML.
- Self-hosted VPS (nginx, Docker, PostgreSQL). New infrastructure must fit that, with no managed-service dependency.
- Keep the Hono API as the single write authority and keep the repository pattern intact.
- The catalog is large, public, read-only, and identical for everyone (ideal sync-engine data, CDN/nginx-cacheable). Per-user data is small and private (needs authorized partial replication).
- Prefer staying inside the TanStack ecosystem we already use over adopting a parallel data layer.

## Considered Options

- ElectricSQL + TanStack DB persistence + offline-transactions
- PowerSync + TanStack DB
- Zero (Rocicorp)
- LiveStore, Jazz, Convex, InstantDB, Triplit
- RxDB (DIY replication endpoints on Hono)
- No sync engine: TanStack Query persistence + service worker PWA

## Decision Outcome

Chosen: **ElectricSQL + TanStack DB 0.6 persistence + offline-transactions**, adopted in sequence rather than as one big cut-over:

1. **Persisted collections.** Wrap the existing collections in `persistedCollectionOptions` (SQLite-WASM in the browser). Reads survive reloads and are answered locally with no new server infrastructure. This step carries no sync-engine risk at all.
2. **Electric for the read stream.** Catalog as a public shape, per-user copies/decks as authorized shapes proxied through the Hono API. This removes refetching entirely: the local store is kept current by replication instead of request/response.
3. **Durable writes** via `@tanstack/offline-transactions` against the existing Hono endpoints: optimistic apply, background replay, retry with backoff.

**Explicitly out of scope: a service worker / PWA manifest.** A service worker buys exactly two things: cold-starting the app with zero network, and installable-PWA status. Neither serves the speed goal; every speed win (local reads, optimistic writes, the mutation outbox) lives in persisted collections and IndexedDB, with no service worker involved. Meanwhile service workers are the most error-prone component in this space (stale caches serving old bundles, users stuck on outdated versions, hard debugging), and their app-shell precaching model fights with our per-request SSR HTML. If installable PWA ever becomes a goal, that is a follow-up decision.

This is the lightest infrastructure (one Apache-2.0 Docker container), keeps Hono as the write authority, and is the path the TanStack DB team themselves are building toward. The risk of building on a beta with three-month-old persistence adapters is accepted: TanStack betas have a good track record for us, and the sequencing is the hedge; each step delivers value on its own.

### How "local-first speed + SSR for SEO" compose

These two goals do not conflict, because they live on different rendering paths, and it is the pattern we already half-use:

- **SSR/SEO path**: route loaders keep fetching from the API server-side, exactly as today. Crawlers get full HTML. This never touches the sync layer.
- **Client path**: after hydration, persisted collections take over. The card catalog syncs as a public Electric shape (thousands of rows, read-only, shared by everyone, CDN-cacheable), per-user copies/decks as authorized shapes, writes through the existing Hono endpoints via offline-transactions.

The repo's existing shape (optimistic mutations through repository-backed API endpoints, hydration-gated live queries, userId-keyed collections) is genuinely well-positioned for this. The write path would not change; the read path would switch from query-collection refetching to a replicated stream.

### Consequences

- Good, because every read after initial sync is local: no roundtrip, no spinner, no perceptible latency. This is the speed goal delivered structurally rather than by optimizing individual requests.
- Good, because the write path is structurally unchanged: Hono endpoints, repositories, and auth stay in place (each mutating endpoint gains a mechanical `txid` addition, see "Consequences for existing code"). Electric is read-path only by design.
- Good, because large amounts of hand-rolled reconciliation code can be deleted (see "Consequences for existing code"): the net effect on the client data layer is simplification, not addition.
- Good, because the catalog shape is public and identical for all users, so nginx can cache it like any other HTTP resource.
- Good, because each step of the sequence is independently shippable and step 1 (persisted collections) has no sync-engine risk.
- Good, because skipping the service worker removes the most error-prone component from the plan.
- Neutral, because without a service worker a cold start (first load, hard reload) still needs the network for HTML and JS. Warm-session interactions, the thing users feel, are local. Acceptable, since offline launch was never the goal.
- Bad, because we take a bet on a beta library (TanStack DB core 0.6.x) with three-month-old persistence adapters and no independent production reports at catalog scale. Accepted: TanStack betas have been reliable for us, and step 1 is cheap to back out of.
- Bad, because SSR support in TanStack DB is pre-v1 work in progress, so the `useHydrated()` gating stays with us for now (it will likely simplify once the official SSR story lands).
- Bad, because Electric adds one more service to operate (logical replication slot, shape cache on disk) and one more thing that can break.
- Neutral, because Electric's January 2026 rebrand to electric.ax (AI-agents positioning) leaves the Postgres sync product unchanged but is worth watching for focus drift.

### Resolved Questions

These were open in the first draft and resolved on 2026-06-12:

1. **How far does "no network requirement" go?** Resolved: speed is the goal, offline is a side effect. We do not engineer for multi-device offline editing conflicts; the offline-transactions outbox gives best-effort durable writes, and that is enough.
2. **Is installable PWA part of the vision?** Resolved: no. The service worker is cut from the plan (see Decision Outcome). Revisit as a separate decision if an installable app ever becomes a goal.
3. **Risk appetite for the beta?** Resolved: accepted. TanStack betas have been dependable for us; we adopt now rather than waiting for v1.

### Consequences for existing code

Audited 2026-06-12. Almost everything tricky in the current client data layer exists to compensate for not having a sync engine: we confirm writes by hand because nothing else tells the client what the server did. Electric's stream becomes that "something else", and whole categories of plumbing collapse.

**`apps/web/src/hooks/use-copies.ts` (~450 lines), the poster child.** Most of its complexity is hand-rolled reconciliation that gets deleted:

- The temp-ID lifecycle: `TEMP_COPY_ID_PREFIX`, optimistic insert with a temp id, the atomic temp-to-real swap via `writeBatch(writeDelete + writeInsert)` on success, `writeDelete` on failure, and the filtering of temp ids out of move/dispose (the in-flight-race comment blocks). The cleanest replacement is even simpler than `awaitTxId` alone: have the client generate the copy UUID and the server insert it as-is. Then there are no temp ids at all; the optimistic row and the synced row arriving through the stream are the same row, and TanStack DB drops the optimistic overlay when the txid shows up. The temp-id module (`lib/temp-copy-id.ts`) and both race-handling blocks go away.
- Manual write-back confirmations: every mutation hand-confirms into the synced store (`utils.writeUpdate`, `utils.writeDelete` inside `mutationFn`). Gone; the stream is the confirmation.
- The invalidation dance: paired `invalidateQueries(copies, refetchType: "none")` + `invalidateQueries(collections)` after every mutation, plus the `fetchQuery`-vs-`ensureQueryData` staleness workaround documented in `lib/copies-collection.ts`. The whole "will a refetch clobber my writes" class of reasoning ceases to exist because there is no refetch path.
- `groupIdForCollection`: a client-side guess at what the server feed would assign, so optimistic rows render correctly. With the synced row carrying the real value moments later, the guess disappears or becomes harmless.

**The react-query `onMutate` snapshots in `use-lists.ts` and `use-collections.ts` (~150 lines).** Five instances of the classic manual optimistic pattern: `cancelQueries`, snapshot, `setQueryData`, rollback in `onError`, `invalidateQueries` in `onSettled`. If lists and collections become synced collections, each reduces to a `collection.update()`; rollback on failure is automatic because TanStack DB keeps optimistic state separate from synced state.

**`lib/deck-builder-collection.ts` (~340 lines), the subtlest win.** The draft save machinery exists because we reconcile by write-back of the save response: `saveTimer`, `saveController` aborting superseded requests, the `saveSeq`/`lastAppliedSeq` counters protecting against out-of-order responses, `suppressSave` during hydration, the hand-rolled subscriber set behind `useDeckSaveStatus`, and `hydrateDeckDraft` diffing server state into the draft. With a synced deck-cards collection plus offline-transactions, edits go through the durable outbox (FIFO, so out-of-order is structurally impossible and the seq counters go away), the hydrate-diff disappears because the collection is the synced state, and save status comes from the 0.6 virtual props (`$synced`/`$origin`) instead of subscriber plumbing. A small debounce to batch rapid edits into one request is still worth keeping, but it shrinks to a few lines once it is not also doing race defense.

**What stays.** The Hono endpoints (each mutating repository function gains `pg_current_xact_id()` capture inside its transaction: mechanical, one-time), the per-user collection identity cache (`markOrphaned` and friends, since shapes are also per-user), the `useHydrated()` gating until TanStack DB v1, the SSR loader path, and the read-mostly react-query usage on admin pages.

**What arrives.** The shape-auth proxy route on Hono, txid in mutation responses, and `schemaVersion` management on persisted collections. Boring, server-side, testable code.

Net ledger: on the order of a thousand lines of the most defect-prone client code (the kind where every third line has a comment explaining a race), plus its tests, traded for a mechanical API change and one proxy route.

## Pros and Cons of the Options

### ElectricSQL + TanStack DB

The natural fit. Apache 2.0, 1.0 GA since March 2025, one Docker container that consumes Postgres logical replication and streams "shapes" (filtered table subsets) over plain HTTP. Crucially it is **read-path only**: writes keep going through our existing Hono API, which returns the Postgres `txid` (captured via `pg_current_xact_id()` inside the mutation's transaction) so the client can drop optimistic state when the change arrives back through the stream (`awaitTxId`). Auth for per-user shapes is a proxy in front of Electric; our Hono server can be that proxy. Infrastructure fits our VPS exactly (nginx can even cache shape responses). Proven at scale (Trigger.dev: 20k updates/sec; benchmarked to 1M concurrent clients).

- Good, because lightest infrastructure: one Apache-2.0 container plus a disk for the shape cache. Needs `wal_level=logical` and a replication role on Postgres.
- Good, because TanStack-blessed: built by the same team as TanStack DB, the canonical example in the docs.
- Good, because the write path stays ours (Hono + repositories), with clean txid-based optimistic-state reconciliation.
- Good, because shapes are plain HTTP and CDN/nginx-cacheable, which suits the large public catalog.
- Bad, because offline persistence and offline writes only landed in TanStack DB 0.6 (2026-03-25) and have no independent production track record yet.
- Bad, because no SSR integration exists for TanStack DB collections; hydration gating remains the documented pattern until v1.
- Neutral, because one detailed 2026 field report ([johnny.sh](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/)) abandoned Electric after two months (long-polling felt "slow and brittle", disliked writing custom write endpoints) and chose Zero. One data point, but a real one. The "custom write endpoints" complaint does not apply to us; we already have them.

### PowerSync + TanStack DB

The most battle-tested offline story: full client-side SQLite (wa-sqlite), a mature upload queue, and per-user "Sync Rules" filtering (arguably the best partial-replication model of the group). Official TanStack partner with an official `@tanstack/powersync-db-collection`. Writes go through a `uploadData()` connector calling our own backend, so write authority stays server-side. Since service 1.3.8, bucket storage can be Postgres instead of MongoDB, so a VPS deployment can be Postgres-only.

- Good, because the offline write queue and conflict-handling model have years of production use, versus Electric's three months.
- Good, because per-user partial replication (Sync Rules with `auth.user_id()`) is first-class.
- Bad, because the service is FSL-licensed (free Open Edition, but not OSI open source; converts to Apache 2.0 after two years).
- Bad, because heaviest deployment of the shortlist (replication instance + API instances + bucket storage).
- Bad, because there is no documented TanStack Start / SSR guidance at all; this gap is unverified territory.

### Zero (Rocicorp)

Hit 1.0 on 2026-06-08. Technically impressive (ZQL queries with schema-level read/write permissions, SQLite replica maintained by a `zero-cache` service), Apache 2.0, positive field reports. **Eliminated twice over for our goals:**

- Bad, because **no offline writes, by design**: mutations are rejected when disconnected; the docs explicitly say revisiting offline is "not a priority right now."
- Bad, because **no SSR**: Rocicorp's own TanStack Start example (ztunes) runs in SPA mode specifically because Zero does not support SSR. That kills the SEO requirement directly.
- Bad, because heavier infrastructure: zero-cache with a SQLite replica, websockets, sticky sessions.

### LiveStore, Jazz, Convex, InstantDB, Triplit

All want to own the data model or replace the backend rather than sync our existing Postgres:

- **LiveStore**: event-sourced SQLite, beta; effectively one eventlog per user, a poor fit for a large shared public catalog, and it does not sync from existing Postgres.
- **Jazz**: CRDT "CoValues" replace Postgres as the source of truth; adopting it means migrating the schema off Postgres.
- **Convex**: a whole-backend replacement (own functions runtime, own data model); we would discard the Hono API, and it is not offline-first anyway.
- **InstantDB**: open source but owns the data model (triples), backend-replacement-shaped, JVM service, self-hosting documented mainly for AWS.
- **Triplit**: team acqui-hired by Supabase in August 2025; the project is effectively community-maintained now. Avoid.

### RxDB (DIY)

Core is Apache 2.0 and mature (8+ years). Replication is protocol-based: we would implement three HTTP endpoints (pull/push/pullStream) on Hono, the cleanest "keep your exact stack" DIY route. Offline-first with queued pushes and conflict handlers is the core design. There is an official `@tanstack/rxdb-db-collection`.

- Good, because no new server infrastructure beyond three Hono endpoints, and full control over sync semantics.
- Bad, because the good browser storages (OPFS, optimized IndexedDB, SQLite, encryption) are in the paid Premium tier (about €1,300/year); the free storages are slow with thousands of docs.
- Bad, because we build and maintain checkpointing, conflict resolution, and replication correctness ourselves.

### No sync engine: TanStack Query persistence + service worker PWA

`persistQueryClient` + an IndexedDB persister, `networkMode: 'offlineFirst'`, and a Workbox service worker for the app shell.

- Good, because zero new infrastructure and zero SSR friction (TanStack Query SSR is mature).
- Good, because it gives solid offline reads of anything previously visited.
- Bad, because offline writes are weak: paused mutations resume only with serializable default mutation functions, there is no rebase-on-server-change, no conflict handling, last-write-wins per cache entry.
- Bad, because the whole persisted client is rewritten to IndexedDB on changes, which hurts with a large catalog cache.
- Neutral, because honestly framed it is "offline-tolerant", not offline-first. It is the cheap fallback if the sync-engine bet feels premature.

## More Information

- Codebase audit (2026-06-12): TanStack packages pinned at `@tanstack/react-db` 0.1.86, `@tanstack/query-db-collection` 1.0.40. Two collections exist (copies via `queryCollectionOptions`, deck drafts via `localOnlyCollectionOptions`), eight `useLiveQuery` consumers, all hydration-gated. Auth via better-auth cookies. No service worker, no manifest, no IndexedDB usage.
- [TanStack DB overview](https://tanstack.com/db/latest/docs/overview) · [Electric collection docs](https://tanstack.com/db/latest/docs/collections/electric-collection) · [PowerSync collection docs](https://tanstack.com/db/latest/docs/collections/powersync-collection)
- [TanStack DB 0.5: query-driven sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync) (2025-11-12) · [TanStack DB 0.6: persistence + includes](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes) (2026-03-25)
- [TanStack/db#865 persistence umbrella issue](https://github.com/TanStack/db/issues/865) · [TanStack/db#1016 useSyncExternalStore SSR issue](https://github.com/TanStack/db/issues/1016) · [@tanstack/offline-transactions](https://github.com/TanStack/db/tree/main/packages/offline-transactions)
- [Electric docs](https://electric.ax/docs/intro) · [deployment guide](https://electric.ax/docs/guides/deployment) · [writes guide](https://electric.ax/docs/guides/writes) · [ElectricSQL 1.0 announcement](https://electric-sql.com/blog/2025/03/17/electricsql-1.0-released)
- [Zero deployment docs](https://zero.rocicorp.dev/docs/deployment) · [ztunes (SPA-mode Start example)](https://github.com/rocicorp/ztunes) · [InfoQ on Zero 1.0](https://www.infoq.com/news/2026/06/zero-version-1/)
- [PowerSync + TanStack partnership](https://tanstack.com/partners/powersync) · [Open Edition](https://www.powersync.com/blog/powersync-open-edition-release) · [Postgres bucket storage](https://releases.powersync.com/announcements/introducing-postgres-for-sync-bucket-storage)
- Field report: [Choosing a sync engine in 2026 (johnny.sh)](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/)

Revisit when TanStack DB reaches v1 (the official SSR story is the named blocker); that release should also simplify or remove the `useHydrated()` gating convention.

## Amendment 1 (2026-07-07): why the first landing failed, and what changed for the second

The first implementation was removed from main on 2026-06-27 because it made the app unusable. Three independent problems stacked; each is addressed for the re-landing.

### 1. Connection saturation from standing live long-polls

Every shape held a `live=true` long-poll open for ~20 seconds, then immediately reconnected: 21 shapes per visitor (16 catalog + 5 per-user), forever. Two distinct ceilings broke:

- **Browser side (HTTP/1.1 contexts):** browsers cap connections at ~6 per origin. In dev (vite's `server.proxy` forces HTTP/1.1) the standing polls occupied the whole pool, so every oRPC call, image, and HMR request queued behind them for up to 20s. Production browsers connect through Cloudflare on h2/h3 and were never capped; the "unusable" experience was primarily this dev-side starvation.
- **Server side (all environments):** every held long-poll occupies a slot at every hop: host nginx, the proxy container (two slots there: downstream + upstream), the Bun API process proxying each stream, and Electric. At 21 held connections per visitor, the proxy container's stock `worker_connections 1024` saturates at roughly 25 concurrent visitors, at which point _everything_ 502s.

Mitigations, in decreasing order of impact:

- **Catalog shapes no longer hold live connections** (`subscribe: false`). They catch up to head on page load (a cheap 204 when nothing changed, thanks to the persisted resume point) and stop. Standing connections drop from 21 per visitor to 5 per _signed-in_ user, and 0 for anonymous visitors. Catalog freshness becomes per-page-load, which for data that changes weeks apart is indistinguishable from live.
- **Dev shapes bypass the vite proxy** and hit the API origin directly (`__ELECTRIC_SHAPE_ORIGIN__`, inlined by vite.config.ts, see `lib/electric-origin.ts`). A separate origin gets its own browser connection pool, so the remaining live polls can't starve the app. Authenticated shapes send the session cookie cross-origin via `credentials: "include"` (localhost ports are same-site; the API's CORS already allows the vite origin with credentials).
- **Origin nginx speaks HTTP/2** (`nginx/openrift.conf` and `preview.openrift.conf`, which need a re-scp + reload on the VPS) and the proxy container's `worker_connections` is raised to 8192 (Dockerfile).

### Capacity: measured baseline and the scaling ladder

Measured 2026-07-07: the host is a 4-core / 7.6 GB Hetzner VPS shared by prod, preview, and the monitoring stack, behind Cloudflare. Peak API rate over the preceding 7 days was 0.14 req/s (single-digit concurrent visitors), so everything below is about ceilings, not current load.

Where the ceilings sit after the mitigations above: a signed-in user with the app in the foreground holds 5 live long-polls, which is 10 connection slots at each nginx layer (downstream + upstream). Anonymous visitors hold none. Background tabs hold none either (the Electric client pauses hidden tabs and catches up on return).

| Layer                                                                | Capacity                                 | Concurrent signed-in users |
| -------------------------------------------------------------------- | ---------------------------------------- | -------------------------- |
| Host nginx at Ubuntu defaults (4 workers x 768 `worker_connections`) | ~3k conns                                | ~300 (the first wall)      |
| Host nginx raised to 8192                                            | ~32k conns                               | ~3,200                     |
| Proxy container (8192, set in the Dockerfile)                        | ~32k conns                               | ~3,200                     |
| Bun API held sockets                                                 | ~20k sockets, ~0.5 GB at 2k users        | ~2,000-3,000               |
| Reconnect churn (0.25 req/s per user; cookie-cache HMAC, no DB hit)  | well under one core at 2k users          | not binding                |
| Electric / Postgres                                                  | designed workload / one replication slot | not binding                |

With the host nginx raise (one line in the events block of `/etc/nginx/nginx.conf` on the VPS, not in this repo), the connection ceilings sit at or above the box's existing CPU throughput ceiling of roughly 2,000-3,000 concurrent actives. The sync engine then costs no meaningful capacity relative to the pre-sync setup, and the box degrades the same way it always has (rising latency rather than hard 502s).

If a ceiling is ever approached, the levers in order of cost:

1. **Bigger box**, and move preview + monitoring off it. Ceilings scale roughly linearly with cores: ~8-10k concurrent.
2. **SSE mode** (`liveSse: true`, supported by the pinned client). Same connection count, but reconnect churn drops to ~0 and idle users become almost pure memory. Needs `proxy_buffering off` and a raised `proxy_read_timeout` on the shape locations. Roughly 15-20k combined with a bigger box.
3. **Lazy shape subscriptions**: start each per-user shape on first use, tear it down after idle. Most sessions never open lists or the deck builder, so the average drops to 2-3 standing connections per user, roughly doubling the ceiling again.
4. **Dedicated sync origin** (e.g. sync.openrift.app): Electric plus a stateless token gate on its own box, using Electric's gatekeeper pattern (the API signs short-lived shape tokens; the sync edge validates them without touching the DB). Shape traffic leaves the app's nginx/Bun chain entirely and the app box returns to pure request/response. A Cloudflare cache rule for the public catalog shapes (already emitted shared-cacheable) makes anonymous catalog sync stop reaching the origin at all. Tens of thousands concurrent.
5. **Horizontal API replicas**. The API is stateless (sessions in cookies, the write outbox is client-side, Electric owns read fan-out); the in-process cron scheduler needs a single-leader guard first. Postgres stays single far beyond this point, because Electric turns read fan-out into one replication slot and leaves Postgres with only the write load.

These are order-of-magnitude estimates for picking the next lever, not commitments. The leading indicator is nginx connection counts: `stub_status` is already exposed on the proxy container but not scraped, and wiring it into Prometheus is the cheap early-warning step.

### 2. Persisted collections coming up permanently empty (TanStack/db#1589)

A schema-mismatch reset in the persistence layer deletes a collection's rows but leaves `collection_metadata` intact, so the Electric resume point survives the wipe; the next load restores 0 rows, resumes "up to date" past all the data, and marks ready. Filed as [TanStack/db#1589](https://github.com/TanStack/db/issues/1589), still open; independently confirmed on React Native on 2026-07-06.

Defenses now in place (all three remain until the upstream fix lands):

- One shared `PERSISTED_SCHEMA_VERSION` for every persisted collection (the diverging-versions trigger cannot occur).
- The version is baked into every shape URL, so a bump rolls the Electric shape identity and discards the resume point together with the rows.
- `wrapPersistenceWithResumeSelfHeal` (lib/db-persistence.ts) drops any `electric:resume` cursor whose row table is empty at load, forcing a fresh snapshot. This also heals installs already poisoned by an earlier wipe.

### 3. Fixes from the first landing that were lost with the removal, now re-applied

- `card_bans` / `card_errata` public shapes must include the `id` primary key column: Electric 400s a shape whose column list omits the PK, so both synced permanently empty.
- The copies-view leftJoin needs `collectionsShape.createIndex((row) => row.id, { indexType: BasicIndex })`, otherwise every copy row triggers a full scan of the collections shape.

### Deck-builder client vertical: two draft backends behind one interface

ADR-035 (browser-local decks for anonymous users) shipped after the first landing and is built on the local-draft machinery this ADR's deck vertical replaced, so the two had to be reconciled by design rather than by merge. Decided 2026-07-07, for code health and open-speed:

- The editor keeps one `DeckDraft` surface; `isLocalDeckId` picks the backend per deck. A deck never changes kind while an editor is open (ADR-035's claim flow converts local decks to server decks explicitly, from the deck list).
- **Local decks** keep the plain draft: an in-memory collection with localStorage write-through. No network, therefore no race defenses.
- **Server decks** read the synced deck-cards shape and write through the offline outbox to the row-level `applyCards` endpoint, confirmed by txid on the stream. Opening a deck becomes a local read (cold loads render from OPFS), and the save-race machinery the old draft needed (save sequencing, abort controllers, hydrate diffing) is deleted with the round trip that caused it.
- Save status unifies to one vocabulary both backends emit honestly: local decks report saved as soon as the write-through lands; server decks report queued / saving / saved / error from outbox state.
- The middle path (synced reads with the old PUT save) was rejected: it keeps the race defenses alive and delivers none of the code-health goal.

### Still open before enabling in production

- Dev OPFS persistence failed with "Security error when calling GetDirectory" in the first landing (no local cache, so every load re-synced from scratch). That DOMException comes from the browser, not our code, and has two known triggers: an insecure context (LAN IP or custom hostname over plain http, where `getDirectory` exists but throws in the worker) and private-browsing windows (Firefox always). `initialize()` now pre-checks `isSecureContext` and names the denial cause in the console, so the next dev session that hits it self-diagnoses; persistence settles to in-memory gracefully either way.
- Verify the Electric-down degradation live once before trusting it as the rollback story: reads fall back to the query layer cleanly (the shape proxy 503s and the layered hooks never switch to the overlay), but the synced mutation hooks dropped most query invalidation because the stream is normally the confirmation, so after a write in outage mode the fallback read stays stale until something refetches. Functional, not pristine.
- Server-deck editing now depends on the sync path: the editor mounts once the deck-cards shape delivers, and there is no REST fallback for the editor itself (deck viewing and every other deck surface stay query-layer). With Electric down, deck editing is unavailable rather than degraded — accepted, since the alternative is keeping the entire race-defense draft machinery alive as a fallback.
- VPS deploy steps: re-scp the nginx confs for h2 and reload, raise `worker_connections` to 8192 in the events block of `/etc/nginx/nginx.conf` while there (see the capacity section above), and let CI rebuild the proxy image for its own connection bump.
- The `useLiveQuery` migration to TanStack DB v1 SSR support (unchanged from the main ADR text).
