---
status: accepted
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

Chosen option: **C — opaque-token user share bundle**, because it is the only option that keeps publishing opt-in and revocable (rules out B), removes the per-list maintenance burden of pasting URLs (rules out A), and stays simpler than building a generic many-to-many "bundle" abstraction (rules out D).

The bundle is **a filtered view**, not an implicit "all wish + trade" dump. The bundle URL acts as a routing primitive — one paste-and-forget link — and visibility of each individual list is gated by the list's own existing sharing primitives:

- A list with its own per-list public `share_token` is visible to anyone who has the bundle URL (anonymous + authenticated).
- A list shared with a friend group is additionally visible to bundle viewers who are members of that group (requires the viewer to be signed in).
- A list with neither is hidden, even from the owner's bundle URL.

This means the bundle never publishes a list that is not already published via some other primitive; it just consolidates the publishing surface into one link. The original "user forgot to share a list" failure mode that motivated an implicit bundle is real, but on reflection the worse failure mode is "a user enables bundle sharing once, then later adds a private wishlist and unknowingly publishes it". The filtered design fails closed: enabling the bundle never exposes a list the user hasn't separately marked as shareable.

### Consequences

- Good — fails closed: enabling the bundle cannot accidentally publish a list the user hasn't separately marked as shareable. Adding a new private wishlist later is safe.
- Good — sharing scales to N lists with one URL; any list the user has already opted into sharing joins the bundle automatically.
- Good — revocation is one column update; rotation is one column update.
- Good — opaque token means the user's handle / email is not in the URL.
- Good — composes additively. Per-list `share_token`s and friend-group shares keep working independently for their own use cases.
- Bad — there is no "one switch publishes everything" affordance. Users who do want every wish/trade list public must enable the per-list share token on each one. We accept this trade because the failure mode of the implicit alternative is worse.
- Bad — adds a third public-share surface (`/lists/share/`, `/decks/share/`, `/collections/share/`, now `/users/share/`). Mitigated by the surfaces being structurally identical and reusing the same `generateShareToken()` helper and dialog shape.
- Bad — the bundle endpoint must load the session to decide visibility, so it can no longer be a CDN-cacheable public response for authenticated viewers (response varies by viewer's group memberships). Anonymous responses stay `public, max-age=60`.

## Design Decisions

### Token shape and storage

A single nullable column `users.share_token text` with a partial unique index `WHERE share_token IS NOT NULL`. `NULL` is the disabled state. The token is produced by the same `generateShareToken()` helper used for list, deck, and collection tokens (12-char base62, ~71 bits entropy). One token per user — rotation overwrites the column in place.

The column lives on `users` rather than in a separate `user_shares` table. There is exactly zero state to associate with a share beyond the token itself: no `created_at` (the share is whatever the current token resolves to; rotating destroys the old binding by design), no per-token metadata, no view counters in this ADR. A separate table would be three columns of overhead for no behavioural benefit.

### Scope: which lists land in the bundle

The bundle contains, at query time, every list owned by the token's user where:

1. `intent IN ('wish', 'trade')` — `organize` lists are excluded unconditionally, and
2. the list is visible to the viewer per the bundle visibility predicate:

```text
lists.share_token IS NOT NULL
  OR EXISTS (
    SELECT 1
      FROM friend_group_list_shares s
      JOIN friend_group_members m ON m.group_id = s.group_id
     WHERE s.list_id = lists.id
       AND m.user_id = <viewer>
  )
```

For anonymous viewers (no session), the predicate reduces to the first branch. The route applies the `loadSession` middleware so authenticated viewers benefit from the second branch automatically; the second branch is omitted entirely when the viewer is anonymous.

Rationale for hard-excluding `organize`: `organize` is the working-state intent ("I'm building this commander deck", "tracking foils I'm hunting"). Surfacing it in a public bundle would surprise users.

Rationale for the filtered visibility predicate: the bundle URL is a publishing convenience, not a publishing decision. Sharing is decided per list (own share token, or friend-group share). The bundle just routes those existing decisions through one URL. This way, enabling the bundle is a low-stakes choice — it never escalates a private list to public — and adding a list later cannot accidentally publish it.

### Recipient experience: index of lists only

The public route is `/users/share/<token>` and renders the same `_app` shell as the existing `/lists/share/<token>` etc. routes (header, footer, theme).

The page is a single **index view**: one card per list, showing name, intent (Wishlist / Tradelist), kind (card / printing / copy), entry count. Clicking into a list lands on `/users/share/<token>/lists/<listId>`, which renders the existing list-share UI contextualised under the bundle (back link points at the bundle, not the per-list token page).

The page header shows the sharer's display name, avatar (via Gravatar), and a one-line "Wishlist & tradelist" subtitle. Opaque token in, named identity out is intentional: a recipient pasting the link into a chat needs to know whose lists they are looking at.

**No merged / unified card-browser view in v1.** Wish lists are `kind ∈ {card, printing}` and trade lists are always `kind=copy` (see [ADR-013](013-friend-groups.md) and migration `135-rename-list-intent`), so a merged grid would have to reconcile three different entry semantics in one cell. The dedup rules, visual markers, and copy-aggregation behaviour needed to make that cell legible add a meaningful surface for marginal value — the index is enough to land "one link, all my lists" without any of that complexity. Revisit if recipients ask for a combined view.

### What the per-list nested route shows

`/users/share/<token>/lists/<listId>` reuses the existing public-list view components and data shape. The auth boundary is the same visibility predicate as the bundle index: the list must belong to the token's owner, sit in the bundle scope (`intent IN ('wish','trade')`), AND pass the per-list visibility check (own share token OR shared with a friend group the viewer belongs to). The repo entry point takes `(userShareToken, listId, viewerUserId | null)`.

### Lifecycle

- **Enable.** `POST /api/v1/users/me/share` — generates a token if `users.share_token IS NULL`, no-op if already set. Returns the current token.
- **Revoke.** `DELETE /api/v1/users/me/share` — nulls the column. Any URL out there immediately resolves to 404.
- **Rotate.** `POST /api/v1/users/me/share/rotate` — generates a fresh token, overwrites the column. The old token immediately resolves to 404; there is no grace period. Rotation is the response to "I pasted this in the wrong channel".
- **Account deletion.** Standard `users.id` cascades remove the column with the row; no special handling.

### UI affordances

- **Lists overview page** carries a "Share all my lists" button that opens a `UserShareDialog` (mirrors the existing `ListShareDialog` shape: enabled-state shows copy + revoke; disabled-state shows a single "Create link" button). Rotate lives behind a small "Reset link" affordance inside the dialog when sharing is enabled.
- **`/profile`** gains a "Public sharing" section housing the same controls, so the user can find and revoke the link from settings without going via the lists page.
- **Per-list passive badge.** Lists already show a "shared with N friend groups" badge and a separate per-list public-link affordance. We do not add a parallel "in your bundle" badge: a list is in the bundle exactly when it has its own public share token or at least one friend-group share — both of which already render their own indicators on the list page.

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

- **A bundle-specific per-list opt-in flag.** The bundle reuses the existing per-list `share_token` and friend-group share signals to decide visibility; it does not introduce a separate "include in bundle" column. One opt-in axis per list, not two.
- **Username-based public URLs.** Opaque token only. We do not want a stable, guessable URL per user.
- **Bundle includes `organize` lists.** Organize is private working state. Hard exclusion.
- **OG preview image.** No PII (Gravatar) in third-party link cards.

## Deferred / Out of Scope

- **Merged / unified card-browser view.** Dedup across `kind=card` wishes, `kind=printing` wishes, and `kind=copy` tradelist entries is non-trivial; the index view ships v1, the merged view waits for a real recipient ask.
- **View counters / last-viewed-at.** Could land later if "is anyone actually opening my bundle" becomes a real question.
- **Multiple bundles per user.** One bundle, one token. A user who wants two different audiences with different list subsets gets a single bundle today; the multi-bundle case is the trigger for the next iteration.
- **Friend-group integration.** Groups continue to use the per-list opt-in flow from ADR-013. The bundle does not surface inside groups, but group shares feed into the bundle's visibility predicate so a group member viewing a friend's bundle sees the lists shared with them.
- **Custom display name / vanity slug on the public page.** The user's existing `users.name` is shown verbatim.
- **Per-bundle abuse rate-limiting.** The token's entropy is the only protection in this ADR; we revisit if scraping shows up.
- **Embedded card-grid widget / oEmbed.** Plain web link only.

## Confirmation

Integration tests on the repository / API layer:

- Enabling sharing sets a token; revoking nulls it; rotating replaces it; the partial unique index forbids two users sharing the same token (an artificial collision test).
- `GET /api/v1/users/share/:token` returns 404 when the token is null, unknown, or has just been rotated.
- The viewer endpoint returns only `wish` and `trade` lists belonging to the token's owner; `organize` lists never appear.
- Anonymous viewer: bundle includes lists with `share_token IS NOT NULL`, excludes lists without a per-list share token even when shared with a friend group.
- Authenticated viewer who is a member of a group the owner has shared a list into: bundle additionally includes that list. Non-member viewer of the same group share: list stays hidden.
- `GET /users/share/:token/lists/:listId` returns 404 when the list belongs to a different user, has `intent='organize'`, or fails the visibility predicate for the viewer.
- Account deletion removes the share row implicitly (no orphan share rows).

Web-layer behaviour exercised in unit tests where possible (hooks, store) and verified manually for the routed views (`/users/share/$token`, `?view=merged`, nested per-list route, lists-overview entry button, profile-page section).
