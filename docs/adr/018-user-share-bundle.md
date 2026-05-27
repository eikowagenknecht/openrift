---
status: proposed
date: 2026-05-27
---

# ADR-018: User Share Bundle for Wish + Trade Lists

## Context and Problem Statement

The unified-lists model (ADR-005, refined by ADR-013) lets a user own any number of `wish` / `trade` / `organize` lists, and each list carries its own opaque `share_token` resolving to `/lists/share/<token>`. Friend groups (ADR-013) give a tightly-scoped in-app channel for sharing many lists with the same circle of trusted people.

Neither primitive fits the most common informal trading channel: a user pasting one URL into a Discord server, WhatsApp group, or LGS chat where the audience is loose and mostly does not have an OpenRift account. The user typically has **several** wishlists (e.g. "Format-A wants", "Holiday targets", "Foils") and one or two tradelists. Today they would have to:

1. Generate a public share token for every list.
2. Paste five or six URLs into the chat.
3. Re-paste any new list they later create.

This is enough friction that users either don't share, or share only one list and silently leave the rest out. The friend-group flow does not help because it requires the recipient to have an account and join the group.

We want a **single public link per user** that exposes their wish + trade lists in one place, so the user shares one URL and forgets about it.

## Decision Drivers

- One link, paste-and-forget. The user must not maintain a list of URLs as they create new lists.
- Public + unauthenticated. Recipients in external chats are usually not signed in.
- Revocable and rotatable. Standard opaque-token semantics — no permanent leak.
- Composes with existing per-list public shares — neither replaces nor breaks them.
- Stays clear of the friend-group flow, which targets a different audience.
- `organize` lists are private working state and must never appear in the bundle.

## Considered Options

- **A. Per-list links, do nothing.** Status quo. User pastes N URLs.
- **B. User profile page at `/u/<username>`.** Always-on, keyed by handle. Anyone who guesses the username sees the lists.
- **C. User share bundle keyed by opaque token at `/users/share/<token>`.** Opt-in, rotatable, mirrors the existing share-token pattern.
- **D. Manual "list bundle" the user assembles.** User explicitly picks lists into a named bundle, gets a token per bundle.

## Decision Outcome

Chosen option: **C — opaque-token user share bundle**, because it is the only option that keeps publishing opt-in and revocable (rules out B), removes the per-list maintenance burden (rules out A), and stays simpler than building a generic many-to-many "bundle" abstraction (rules out D — D would re-introduce the maintenance problem we set out to remove).

The bundle is **implicit**: it always contains all of the owner's `wish` and `trade` lists, live. There is no per-list opt-out at this stage; users who want a list off the bundle keep it as a draft they have not yet committed to, or move sensitive entries to a separate organize list. We accept this constraint — it is the simplest possible model and matches the "I want to share my whole want/trade situation" use case the feature exists for.

### Consequences

- Good — sharing scales to N lists with one URL; new lists join the bundle automatically.
- Good — revocation is one column update; rotation is one column update.
- Good — opaque token means the user's handle / email is not in the URL.
- Good — composes additively. Per-list `share_token`s keep working independently for the "I just want to share this one list" case.
- Bad — no fine-grained "share these two wishlists but not this third one" control. Users with that need are blocked until a later ADR introduces explicit bundles.
- Bad — adds a third public-share surface (`/lists/share/`, `/decks/share/`, `/collections/share/`, now `/users/share/`). Mitigated by the surfaces being structurally identical and reusing the same `generateShareToken()` helper and dialog shape.

## Design Decisions

### Token shape and storage

A single nullable column `users.share_token text` with a partial unique index `WHERE share_token IS NOT NULL`. `NULL` is the disabled state. The token is produced by the same `generateShareToken()` helper used for list, deck, and collection tokens (12-char base62, ~71 bits entropy). One token per user — rotation overwrites the column in place.

The column lives on `users` rather than in a separate `user_shares` table. There is exactly zero state to associate with a share beyond the token itself: no `created_at` (the share is whatever the current token resolves to; rotating destroys the old binding by design), no per-token metadata, no view counters in this ADR. A separate table would be three columns of overhead for no behavioural benefit.

### Scope: which lists land in the bundle

The bundle contains, at query time, every list owned by the token's user where `intent IN ('wish', 'trade')`. No materialisation, no membership rows, no opt-out toggle. `organize` lists are excluded.

Rationale for hard-excluding `organize`: `organize` is the working-state intent ("I'm building this commander deck", "tracking foils I'm hunting"). Surfacing it in a public bundle would surprise users; promoting it to bundle-eligible only on a per-list flag would defeat the "no per-list maintenance" goal that motivates this feature.

Rationale for hard-including all `wish` and `trade`: the failure mode we are trying to remove is "user forgot to share a list". A per-list opt-out re-introduces exactly that failure mode. Users who need to hide a single wishlist can defer it (don't make it a wishlist until ready to share) — this is the same answer the `decks.is_public` design landed on.

### Recipient experience: index of lists only

The public route is `/users/share/<token>` and renders the same `_app` shell as the existing `/lists/share/<token>` etc. routes (header, footer, theme).

The page is a single **index view**: one card per list, showing name, intent (Wishlist / Tradelist), kind (card / printing / copy), entry count. Clicking into a list lands on `/users/share/<token>/lists/<listId>`, which renders the existing list-share UI contextualised under the bundle (back link points at the bundle, not the per-list token page).

The page header shows the sharer's display name, avatar (via Gravatar), and a one-line "Wishlist & tradelist" subtitle. Opaque token in, named identity out is intentional: a recipient pasting the link into a chat needs to know whose lists they are looking at.

**No merged / unified card-browser view in v1.** Wish lists are `kind ∈ {card, printing}` and trade lists are always `kind=copy` (see [ADR-013](013-friend-groups.md) and migration `135-rename-list-intent`), so a merged grid would have to reconcile three different entry semantics in one cell. The dedup rules, visual markers, and copy-aggregation behaviour needed to make that cell legible add a meaningful surface for marginal value — the index is enough to land "one link, all my lists" without any of that complexity. Revisit if recipients ask for a combined view.

### What the per-list nested route shows

`/users/share/<token>/lists/<listId>` reuses the existing public-list view components and data shape. The only difference is the auth boundary: instead of the per-list `share_token` granting access, the user-bundle token grants access to any of the owner's wish/trade lists. The repository method that resolves "is this viewer allowed to see this list" gets a new entry point that takes `(userShareToken, listId)` and checks the list belongs to that user and is in the bundle scope (`intent IN ('wish','trade')`).

### Lifecycle

- **Enable.** `POST /api/v1/users/me/share` — generates a token if `users.share_token IS NULL`, no-op if already set. Returns the current token.
- **Revoke.** `DELETE /api/v1/users/me/share` — nulls the column. Any URL out there immediately resolves to 404.
- **Rotate.** `POST /api/v1/users/me/share/rotate` — generates a fresh token, overwrites the column. The old token immediately resolves to 404; there is no grace period. Rotation is the response to "I pasted this in the wrong channel".
- **Account deletion.** Standard `users.id` cascades remove the column with the row; no special handling.

### UI affordances

- **Lists overview page** carries a "Share all my lists" button that opens a `UserShareDialog` (mirrors the existing `ListShareDialog` shape: enabled-state shows copy + revoke; disabled-state shows a single "Create link" button). Rotate lives behind a small "Reset link" affordance inside the dialog when sharing is enabled.
- **`/profile`** gains a "Public sharing" section housing the same controls, so the user can find and revoke the link from settings without going via the lists page.
- **Per-list passive badge.** Lists already show a "shared with N friend groups" badge. We do not add a parallel "in your bundle" badge: every wish / trade list is implicitly in the bundle when sharing is enabled, so the badge would carry no information.

### Routes summary

```
GET  /users/share/$token
GET  /users/share/$token/lists/$listId

POST   /api/v1/users/me/share
DELETE /api/v1/users/me/share
POST   /api/v1/users/me/share/rotate
GET    /api/v1/users/share/:token
GET    /api/v1/users/share/:token/lists/:listId
```

Web routes follow the existing `lists_.share.$token` / `decks_.share.$token` / `collections_.share.$token` file-naming pattern.

### Empty states

- **Sharing enabled, user has no wish / trade lists.** Render the shadcn `Empty` component with title "Nothing shared yet" and body "This person hasn't added any wishlist or tradelist items yet." 200 OK, not 404 — the link is valid, the cupboard is empty.
- **Sharing disabled / token unknown.** 404.

### OG metadata

The public route emits OpenGraph tags so Discord / Slack / iMessage previews look sensible: title `"{Display Name}'s wish & tradelists"`, description `"{N} wishlists, {M} tradelists, {K} cards in total"`, no image. We deliberately omit an OG image — pulling Gravatars into link previews on third-party platforms is more PII leakage than the feature is worth, and the title is enough to identify the link.

## Schema sketch

```sql
ALTER TABLE users
  ADD COLUMN share_token text;

CREATE UNIQUE INDEX uq_users_share_token
  ON users (share_token) WHERE share_token IS NOT NULL;
```

That is the entire schema change. No new table, no triggers, no FK additions.

## Will Not Be Built

- **Per-list opt-out.** The bundle is "all wish + trade, no exceptions". Users who need finer control wait for a later "explicit bundle" feature, which is a separate ADR.
- **Username-based public URLs.** Opaque token only. We do not want a stable, guessable URL per user.
- **Bundle includes `organize` lists.** Organize is private working state. Hard exclusion.
- **OG preview image.** No PII (Gravatar) in third-party link cards.

## Deferred / Out of Scope

- **Merged / unified card-browser view.** Dedup across `kind=card` wishes, `kind=printing` wishes, and `kind=copy` tradelist entries is non-trivial; the index view ships v1, the merged view waits for a real recipient ask.
- **View counters / last-viewed-at.** Could land later if "is anyone actually opening my bundle" becomes a real question.
- **Multiple bundles per user.** One bundle, one token. A user who wants two different audiences with different list subsets gets a single bundle today; the multi-bundle case is the trigger for the next iteration.
- **Friend-group integration.** Groups continue to use the per-list opt-in flow from ADR-013. The bundle does not surface inside groups.
- **Custom display name / vanity slug on the public page.** The user's existing `users.name` is shown verbatim.
- **Per-bundle abuse rate-limiting.** The token's entropy is the only protection in this ADR; we revisit if scraping shows up.
- **Embedded card-grid widget / oEmbed.** Plain web link only.

## Confirmation

Integration tests on the repository / API layer:

- Enabling sharing sets a token; revoking nulls it; rotating replaces it; the partial unique index forbids two users sharing the same token (an artificial collision test).
- `GET /api/v1/users/share/:token` returns 404 when the token is null, unknown, or has just been rotated.
- The viewer endpoint returns only `wish` and `trade` lists belonging to the token's owner; `organize` lists never appear.
- `GET /users/share/:token/lists/:listId` returns 404 when the list belongs to a different user or has `intent='organize'`.
- Account deletion removes the share row implicitly (no orphan share rows).

Web-layer behaviour exercised in unit tests where possible (hooks, store) and verified manually for the routed views (`/users/share/$token`, `?view=merged`, nested per-list route, lists-overview entry button, profile-page section).
