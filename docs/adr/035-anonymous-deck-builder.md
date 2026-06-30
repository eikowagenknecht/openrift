---
status: proposed
date: 2026-06-29
---

# ADR-035: Anonymous (Logged-Out) Deck Builder

## Context and Problem Statement

Building a deck is the most engaging thing a new visitor can do, but today it is entirely behind the login wall. Every deck-building route lives under `apps/web/src/routes/_app/_authenticated/decks/`, and `_app/_authenticated/route.tsx` redirects logged-out visitors to `/login`. The data model assumes ownership: `decks.user_id` is `NOT NULL` (`docs/schema.sql`), every deck repository method except the public share-token lookup is `userId`-scoped, and the client-side draft engine (`apps/web/src/lib/deck-builder-collection.ts`) returns `null` and no-op actions when there is no `userId`.

We want people to **build decks without logging in**, save them, come back to them, and (when they choose) sign in and keep them. The questions this ADR answers: where does an anonymous deck live, how is it displayed, how does it relate to the normal logged-in builder, and how does an anonymous deck become an account deck.

## Decision Drivers

- **Speed is the product goal.** Offline is a side effect of the architecture, not a feature we bolt on (project principle). A logged-out builder should feel instant and require no network round-trip.
- **No new unauthenticated write surface.** The API auth model is fail-closed by default. Opening an anonymous write path to the database invites spam, unbounded row creation, TTL/garbage-collection work, and a privacy question about storing anonymous user content. We want to avoid all of that.
- **Reuse the existing builder, not a parallel one.** The add/remove/move/quantity logic, rune auto-balancing, format-aware zone caps, and validation already exist in `use-deck-builder.ts` and the local-only TanStack-DB draft collection. The anonymous path should differ only in its data source and persistence sink, not in the editor itself.
- **A clean path from anonymous to account.** A visitor who builds a deck and then signs up should not lose their work, and should not be surprised by silent server-side storage.
- **One coherent deck list.** A logged-in user should see their server decks and any decks built while logged out in a single list, not on two separate pages.

## Considered Options

For **where an anonymous deck lives**:

- **Local-only (browser `localStorage`), full-fidelity JSON.** Anonymous decks are stored client-side, keyed by a synthetic `local:<uuid>` id, mirroring the match tracker (`apps/web/src/stores/match-tracker-store.ts`). Portability across devices is handled by exporting a deck code.
- **Deck-code / URL only (stateless).** No per-device list. "Save" means copying a Piltover/text/TTS deck code or link. Lossy: a deck code carries only card shortCode + quantity + zone, never name, description, plan, or preferred printings.
- **Server-stored anonymous decks (nullable owner + claim token).** Relax `decks.user_id` to nullable (or a separate table), create the deck server-side with a secret edit token in `localStorage`, claim to an account on login (the deck-check feature's `claim_token` pattern, ADR-026).

For **route structure** (once a merged list for logged-in users is required):

- **Distinct local paths under `_app`** (`/decks/local`, `/decks/local/$id`), authenticated tree untouched.
- **Lift the whole `decks/*` tree out of `_authenticated`** into `_app`, auth-optional, one `/decks` for everyone.

## Decision Outcome

Chosen storage: **local-only `localStorage`, full-fidelity JSON, with the deck code as the cross-device / share escape hatch.** It is the only option that needs no schema change and opens no anonymous server-write surface, it matches the speed/offline principle, and both building blocks already exist in the codebase (the fully-local match tracker, and the local-only optimistic draft collection). The deck-code-only option is lossy and is not a "my decks" experience on its own; it becomes the portability layer, not the store. Server-stored anonymous decks are rejected for v1: nullable ownership ripples through nearly every `userId`-scoped query and the fail-closed auth model, and it introduces spam, TTL/GC, and privacy work that is disproportionate to "let people try the builder."

Chosen route structure: **lift `decks/*` out of `_authenticated` into `_app`, auth-optional.** Because a merged single list is required (see product decision below), the distinct-path approach's only advantage (never touching the authenticated tree) is spent on the merge logic anyway, leaving a second list page for no benefit. One `/decks` tree, branching on session and on the `local:` id prefix, is the cleaner end state.

### Product decisions (confirmed)

- **Scope: multiple local decks plus a list.** A logged-out visitor gets the full builder and a "my decks" list, not a single scratch deck.
- **Cards only for local decks in v1.** Local decks store and edit only the card list. The deck plan (ADR-029: strategy, mulligan, battlefields, matchups, swaps) stays a logged-in feature. The Plan tab is shown disabled in the local builder with a "Sign in to add a strategy plan" hint. After a local deck is imported, its owner can add a plan normally.
- **Local is the logged-out path only.** Logged-in users always create server decks. Local decks exist solely for things built while logged out (or imported from a code while logged out). There is no "save locally" choice for logged-in users; the merged list exists to surface and migrate the local backlog, not to author new local decks.
- **Deck-code import works logged out and creates a local deck.** Pasting a Piltover/text/TTS code while logged out builds a local deck, reusing the existing client-side decode (`apps/web/src/lib/deck-import-parsers.ts`). A natural anonymous onboarding path.
- **Claim on login is explicit and selectable.** After sign-in, if local decks exist, a one-time prompt lists them with checkboxes. The user picks which to import; imported decks are written to the account (`decks.create` + `decks.replaceCards`) and removed from local storage, unpicked decks stay local. No automatic import.

### Consequences

- Good, because the logged-out builder needs no new server endpoint and no database change. The entire feature ships in `apps/web` plus a small amount of deck-code-encode wiring.
- Good, because the editor is byte-for-byte the same as the logged-in builder. Only the draft collection's persistence sink (local store vs server autosave) and data source (local store vs `useDeckDetail`) change.
- Good, because there is no anonymous data in the database, so no spam surface, no TTL/garbage collection, and no privacy/GDPR question about stored anonymous content.
- Good, because a logged-in user sees one merged `/decks` list (server decks plus badged local decks with an inline import action), with nothing hidden on a second page.
- Bad, because local decks are tied to one browser. They are lost on cache clear and do not sync across devices unless the user exports a deck code. This is communicated with an "on this device only" badge and a "sign in to sync" nudge; the deck code is the cross-device bridge.
- Bad, because exporting a local deck to a deck code is lossy (no name, no plan, no preferred printings, only cards). Consistent with ADR-029's "plans are not in deck codes," and acceptable because the full-fidelity copy lives in `localStorage` and travels intact into the account on import.
- Bad, because owned-count chips are blank in the logged-out builder (the `copiesCollection` is already `null` without a session, `apps/web/src/hooks/use-owned-count.ts`). Expected: ownership data requires an account.
- Bad, because lifting `decks/*` out of `_authenticated` means the existing loaders become auth-optional, a non-trivial refactor of routes that currently assume a `userId`. Mitigated by branching on the `local:` id prefix and on session presence at well-defined points.

## Design Decisions

### Local deck store

New Zustand store `apps/web/src/stores/local-decks-store.ts`, `persist`ed to `localStorage` (default storage, like the match tracker), `name: "openrift-local-decks"`.

- Keyed record of decks under `local:<uuidv7>` ids.
- Each entry mirrors the **server deck-detail shape** so the import map is mechanical and lossless for what v1 stores:

```ts
interface LocalDeck {
  id: string; // "local:<uuidv7>"
  name: string;
  description: string;
  format: string; // deck_formats slug
  formatConfig: FormatConfig | null; // e.g. Custom-Region tag slugs
  cards: Array<{
    zone: string; // deck_zones slug
    cardId: string;
    quantity: number;
    preferredPrintingId: string | null;
  }>;
  createdAt: string; // ISO; stamped by the store, not Date.now() in module scope
  updatedAt: string;
}
```

- No deck plan fields in v1 (cards only). The shape leaves room to add them later without a storage migration.
- Actions: `createDeck(format, name?)`, `renameDeck`, `setDescription`, `deleteDeck`, `duplicateDeck`, `setCards` (the bulk write the draft collection calls on save), `list()`, `get(id)`, and `clearImported(ids)` for the claim flow.
- A soft guard against runaway storage: warn (do not block) once the store holds an unusually large number of decks, and catch `QuotaExceededError` on write with a user-facing message rather than a silent failure. No hard cap in v1.
- Per project test requirements: `local-decks-store.test.ts` covering create/rename/delete/duplicate, card writes, the `local:` id guard, the import-payload mapping, and quota-error handling. Use `createStoreResetter()` for isolation.

### Builder data source and persistence

Extend `apps/web/src/lib/deck-builder-collection.ts` rather than fork it. The draft is already a local-only optimistic TanStack-DB collection; only the save target is server-bound.

- Gate on the **`local:` id prefix**, never on the absence of `userId`. `userId` is briefly `null` during session load even for a logged-in user (the no-op window at `apps/web/src/hooks/use-deck-builder.ts:601-624` exists for exactly that reason), so gating on "no userId" would route a logged-in user's real deck down the local path mid-load. A `local:` id is unambiguous; key the local draft under a fixed sentinel scope (e.g. the literal `"local"` in place of `userId`) so `useDeckDraftCollection` and `useDeckBuilderActions` stop returning `null` / no-ops for it.
- In `scheduleSave` / `runSave`, branch on the id: a `local:<id>` deck debounce-writes its full card set into `local-decks-store` (`setCards`); a server deck keeps the existing `saveDeckCardsFn` → authenticated `decks.replaceCards` path.
- Hydrate a local draft from `local-decks-store` instead of `useDeckDetail`. The existing `hydrateDeckDraft` seam is the place to branch.
- `useDeckSaveStatus` reports "Saved on this device" for local decks. The `beforeunload` dirty warning still applies during the debounce window.
- The editor UI, all add/remove/move/setQty/changePrinting actions, rune auto-balancing, 3-copy caps, single-slot zone handling, and `validateDeck` violations are unchanged.

### Routes

Lift the deck tree from `apps/web/src/routes/_app/_authenticated/decks/` to `apps/web/src/routes/_app/decks/`. Replace the blanket guard with per-case handling.

- **`/decks` (list)** renders for everyone. It reads `local-decks-store` always, plus `decks.list` when a session exists, and merges into one list. Local decks carry an "on this device" badge and an import affordance; server decks render as today. Because local data is client-only, the list is client-rendered (it cannot meaningfully SSR a per-browser store); the server-deck portion still hydrates from the session query as today.
- **`/decks/$deckId` (builder)** branches on the id:
  - `local:<id>` → local store path, works logged in or out.
  - real server id + session → today's server path.
  - real server id + no session → `redirect` to `/login` with the `redirect` search param preserved, keeping current behavior for bookmarked or shared authenticated deck links.
- **`/decks/import`** drops its auth requirement. Logged out, a pasted code creates a `local:` deck and routes to it. Logged in, it behaves as today (creates a server deck), including the existing optional `replaceDeckId`.
- Loaders go auth-optional: skip the server fetch (`deckDetailQueryOptions(userId, deckId)`) for `local:` ids; require a `userId` only for server ids. The builder route keeps `ssr: "data-only"`.
- "New deck" entry: logged out creates a `local:` deck (format chosen up front, as server decks do today); logged in creates a server deck unchanged.

### Sharing a local deck

A local deck has no server row, so the server share token, the public `decks/share/{token}` page, and the share image are unavailable. The share affordance for a local deck offers the **deck code** instead: copy the Piltover code string and the "Play on RiftAtlas" link. This requires wiring client-side deck-code **encode** in the web app: `getCodeFromDeck` from `@piltoverarchive/riftbound-deck-codes` currently runs only server-side (`apps/api/src/services/deck-codecs/piltover.ts`). Add a thin web-side encoder so a local deck exports a code with no server call. Decode already runs client-side. The deck-share dialog shows the deck-code variant for local decks and the existing server share variant for owned decks, with a "Sign in to create a shareable link and image" nudge on the local variant.

### Claim on login (anonymous to account)

- On a successful login or signup, if `local-decks-store` is non-empty, show a one-time prompt listing each local deck (name, format, card count) with a checkbox.
- For each selected deck, create it on the account: `decks.create` for the deck row, then `decks.replaceCards` with the local card set. (No plan rows in v1.)
- On success, remove the imported decks from `local-decks-store` (`clearImported`). Unselected decks remain local. The write-then-clear is sequenced so a freshly imported deck does not briefly appear twice in the merged list (it is removed from local only after the server create resolves and the deck list query is invalidated).
- The prompt is shown once per sign-in event; a "not now" leaves the decks local and re-offers on the next sign-in while any local deck remains.

### Logged-out UX cues

- An "on this device only" badge on local decks in the list and a line in the builder.
- A persistent but unobtrusive "Sign in to sync across devices" nudge in the local builder and list.
- The Plan tab visible but disabled with "Sign in to add a strategy plan."
- Owned-count chips simply render nothing (no account, no collection).

## Will Not Be Built (v1)

- **Deck plans for local decks.** Cards only; the plan editor stays logged-in. Added after import.
- **Server-stored anonymous decks / nullable owner.** No schema change, no anonymous write endpoint.
- **Cross-device sync of local decks without a deck code.** The deck code is the only bridge; full sync requires an account.
- **A server share page or share image for local decks.** Deck code only.
- **A "save locally" option for logged-in users.** Local is the logged-out path only.
- **Automatic import on login.** Import is explicit and selectable.

## Deferred / Out of Scope

- **Full-fidelity local plans** (storing and editing the ADR-029 plan offline, importing it with the deck). Revisit if logged-out users ask for plans.
- **A hard cap or eviction policy** for local decks. Soft warning plus quota-error handling in v1.
- **Conflict handling on import** beyond create-new (e.g. matching against an existing same-named server deck). v1 always creates a new server deck.
- **Sharing a local deck via a short server link.** Requires a server row; deferred with anonymous server storage.

## Implementation Notes

This section pins the spots where the design above otherwise forces a guess. Line numbers are from the state of the repo when this ADR was written; treat them as anchors, not guarantees, and re-grep if they have drifted. **Work in a worktree** (the repo's worktree rule), and follow the conventions called out inline (they are all in `docs/contributing.md`).

1. **Moving `decks/*` out of `_authenticated` removes `context.userId`.** The guard at `apps/web/src/routes/_app/_authenticated/route.tsx:9-19` is what injects `{ userId }` into route context, and every deck loader consumes it (e.g. `apps/web/src/routes/_app/_authenticated/decks/index.tsx:12` calls `decksQueryOptions(context.userId)`; the builder loader calls `deckDetailQueryOptions(context.userId, deckId)`). Once these routes move under `_app`, `context.userId` no longer exists. Each loader must instead resolve the session itself via `sessionQueryOptions()` (`apps/web/src/lib/auth-session.ts`) and branch:
   - list loader: if there is a session, `ensureQueryData(decksQueryOptions(userId))`; if not, load nothing from the server (the local list is client-side).
   - builder loader: `local:` id → no server fetch; real id + session → today's `deckDetailQueryOptions`; real id + no session → `throw redirect({ to: "/login", search: { redirect: location.href } })` (mirror the existing guard's redirect shape).
   - The `_authenticated` layout itself stays for its other children: `collections`, `groups`, `profile`, `tournaments_*`, `organizations_*`, `admin` all still live under it. Only the `decks/*` subtree moves.

2. **The merged list must synthesize the server list-item shape for local decks.** The list renders `DeckListItemResponse` (`packages/shared/src/types/api/deck.ts:40-49`): `deck` (a `DeckSummaryResponse` with `id, name, format, formatConfig, isPinned, archivedAt, createdAt, updatedAt`), plus `legendCardId`, `championCardId`, `totalCards`, `typeCounts`, `domainDistribution`, `isValid`, `totalValueCents`. The list sorts, filters, and **groups** on these (`groupDecks(...)` in `apps/web/src/components/deck/deck-list-page.tsx`, which groups by domain via `domainDistribution`). A local deck has none of these server-computed fields, so build a client-side adapter that derives them from the local deck's cards + the catalog: legend/champion from the cards in those zones, `totalCards`/`typeCounts`/`domainDistribution` by summing card metadata, `isValid` from `validateDeck`, `totalValueCents = null`, `isPinned = false`, `archivedAt = null`. Do not feed a partial object into the list — the grouping will throw or render blanks. Local rows additionally carry the "on this device" badge and the import affordance.

3. **Gate the local draft on the `local:` prefix, not on `userId`** (see the body section "Builder data source and persistence"). The draft engine is keyed per `(QueryClient × userId × deckId)` at `apps/web/src/lib/deck-builder-collection.ts` (`getDeckDraftCollection:212`, `hydrateDeckDraft:242`, `useDeckDraftCollection:304`). For the local case substitute the literal scope `"local"` for `userId`. Branch the save sink in `scheduleSave:135` / `runSave:82`: a `local:` deck writes its full card set to `local-decks-store.setCards` (debounced, reuse `SAVE_DEBOUNCE_MS`); a server deck keeps the `saveDeckCardsFn` path (`:99`). Branch the source in `hydrateDeckDraft:242`: seed from the local store instead of `useDeckDetail` (`apps/web/src/hooks/use-decks.ts:74`).

4. **Fork the create-deck flow for the local path.** `CreateDeckDialog` in `apps/web/src/components/deck/deck-list-page.tsx` (the format `Select` + name field at ~`:73-137`) currently calls `useCreateDeck().mutate({ name, format })` then `navigate({ to: "/decks/$deckId", params: { deckId: deck.id } })` (~`:76-81`). Logged out, the same dialog should instead call `localDecksStore.createDeck(format, name)` and navigate to the returned `local:` id. Keep one dialog; branch on session.

5. **Deck-code encode needs the catalog client-side.** `getCodeFromDeck` from `@piltoverarchive/riftbound-deck-codes` maps **card shortCodes** + quantities (the server path is `apps/api/src/services/deck-codecs/piltover.ts`). The web side currently only decodes (`apps/web/src/lib/deck-import-parsers.ts`). To encode a local deck client-side, resolve each `cardId` to its shortCode via the catalog the web app already loads, pick the champion/legend the codec expects, and call `getCodeFromDeck`. Add this as a small `@/lib/deck-code-encode` helper with a round-trip test (encode → `parsePiltoverDeckCode` → same cards). This powers the local deck's share affordance (deck code + "Play on RiftAtlas" link); the server share token / share image stay unavailable for local decks.

6. **Trigger the import prompt from the merged list, not from each auth form.** Rather than wiring `login-form.tsx:79/117` and `signup-form.tsx` (and social/OTP paths) individually, mount a one-time check in the `/decks` list: when a session is present **and** `local-decks-store` is non-empty, surface the selectable import prompt. This catches every sign-in path (email, OTP, social) with one seam. Import each selected deck with `decks.create` then `decks.replaceCards` (`apps/web/src/hooks/use-decks.ts`), invalidate the deck list, then `clearImported(ids)` — clear only after the server create resolves so the deck never shows twice. "Not now" leaves them local and re-offers while any local deck remains.

7. **Honor the SSR and store conventions.** The list reads a `localStorage`-backed store, so gate any client-only data behind `useHydrated()` from `@/hooks/use-hydrated` (the project's required pattern — do not hand-roll `useState` + `useEffect`). The new `local-decks-store` is a Zustand store and therefore needs a `local-decks-store.test.ts` with `createStoreResetter()` isolation (project test requirement). Stamp `createdAt`/`updatedAt` inside actions, not at module scope. This is a `feat`, so add a changelog entry under `Decks` when the code lands (this ADR alone is docs-only and does not get one).

## Confirmation

- Web unit tests: `local-decks-store.test.ts` (CRUD, card writes, `local:` id guard, import-payload mapping, quota handling); the draft-collection save branch (local id writes to the store and debounces; server id still calls `replaceCards`); the claim-import mapping (local shape to `create` + `replaceCards` payload); the deck-code encode round-trip (encode a local deck, decode it back to the same cards).
- Route behavior: logged-out `/decks` renders the local list; logged-out `/decks/$localId` edits; logged-out real-id redirects to `/login` with `redirect` preserved; logged-out `/decks/import` of a code creates and opens a local deck.
- Manual: build a deck logged out, reload (it persists), sign in, import a subset, confirm imported decks become server decks and disappear from local, unpicked stay; confirm the Plan tab is disabled locally and works after import; confirm owned counts are blank logged out.
- Regression: a logged-in user with no local decks sees today's `/decks` unchanged.

## More Information

- Related: ADR-021 (Match Tracker) for the fully-local `localStorage` Zustand pattern this store mirrors; ADR-029 (Deck Plans) for why plans stay out of deck codes and the plan model that local decks defer; ADR-026 (Player Self-Service for Deck Checks) for the claim-token pattern that the rejected server-anonymous option would have used.
- Existing primitives reused: `apps/web/src/lib/deck-builder-collection.ts` (optimistic draft), `apps/web/src/hooks/use-deck-builder.ts` (actions/validation), `apps/web/src/lib/deck-import-parsers.ts` (client decode), `@piltoverarchive/riftbound-deck-codes` (`getCodeFromDeck` for the new web-side encode).
