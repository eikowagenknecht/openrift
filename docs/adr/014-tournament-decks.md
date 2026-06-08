---
status: proposed
date: 2026-06-08
---

# ADR-014: Tournament Decks Archive

> **Update (2026-06-08, see ADR-022):** the `/tournaments` route is now a shared **hub** co-located with the FFA pod-pairing tournament runner (ADR-022). The archive described here keeps its routes (`/tournaments`, `/tournaments/decks`, `/tournaments/meta`, `/tournaments/$slug`, `/tournaments/$slug/$shareToken`); the runner lives under the reserved `/tournaments/run/` segment. The two share only the URL home, not data: separate tables (`tournaments` vs `pod_tournaments`), repositories, ownership, and audiences. `run` is added to the reserved-slug list below.

## Context and Problem Statement

Players researching the Riftbound meta currently hop over to **riftdecks.com**, which carries tournament results and their decklists. The lists there work, but they are decoupled from anything OpenRift knows about you: cards do not link to the catalog, there is no "do I own this?" overlay against your collection, no way to fork a list into your own decks for tracking, and the site is ad-supported.

OpenRift already has a complete decks subsystem — `decks` rows, `deck_cards`, formats, champion handling, share tokens, the deck-builder UI — built around per-user ownership. We want to extend that infrastructure to host a **publicly browsable, admin-curated archive of tournament decks**, integrated with the catalog and collection on every surface where a card is rendered.

The decision is how to model tournament decks (separate world vs. reuse `decks`), where event metadata lives, and how the read-only archive coexists with user-owned decks.

## Decision Drivers

- **Reuse, don't duplicate.** The existing `decks` schema, deck-detail UI, card-list rendering, champion logic, and share-token routing are exactly what we'd build for tournament decks anyway. A parallel `tournament_decks` table with its own `tournament_deck_cards` would mean two of every query, every component, every test.
- **Catalog integration is the value-add.** Every card in a tournament deck must link to its catalog page; the collection overlay must compute missing copies for logged-in users without bespoke wiring.
- **Public + crawlable.** Tournament pages are unauthenticated, SSR'd, and SEO-friendly — they are the entry funnel from Google searches for specific decks or champions.
- **Curated, not user-generated.** Decks are entered by admins through an admin form. No submission flow, no moderation queue, no claim mechanism for pilots. Curation cost is acceptable because each tournament has a small fixed deck list (winner, top-cut handful) and entry is rare (one event per week or two).
- **Forks are pure copies.** A user forking a tournament deck gets a fresh, owned, editable deck. No back-link, no upstream sync, no "you have unread changes." Once forked, the two diverge permanently.
- **Tournament metadata is intentionally light.** riftdecks already handles event metadata fine; we match it, not exceed it. Location, organizer richness, full standings, archetype taxonomy are out of scope for v1.

## Considered Options

- **Reuse the `decks` shape with a synthetic owner + satellite `tournaments_decks` table.** Tournament decks ARE rows in `decks`, owned by a single seeded `tournament-archive` system user, with a satellite row in `tournaments_decks` carrying event_id, finish, and player name.
- **Separate snapshot tables.** A new `tournament_decks` + `tournament_deck_cards` pair, immutable after submission, independent of the user-deck schema. Forking copies into `decks`.
- **Flag/extend `decks` with denormalised tournament columns.** Add `tournament_id`, `player_name`, `finish` directly to `decks`. No satellite table, no synthetic user. Every `decks` query has to know about tournament columns even when they're NULL.

## Decision Outcome

Chosen option: **Reuse the `decks` shape with a synthetic owner + satellite `tournaments_decks` table**, because it inherits the entire deck-rendering, card-list, champion, format, and share-token infrastructure for free, while keeping tournament-specific concerns (event, finish, player) cleanly isolated to one satellite table that the rest of the app can ignore.

### Consequences

- Good, because the existing deck-detail page renders a tournament deck with zero changes (sidebar adds an "Event" panel when a `tournaments_decks` row exists; otherwise it is the user-deck page).
- Good, because fork is just the existing "duplicate deck" mutation with the requester as the new owner — no new code path, no snapshot semantics to maintain.
- Good, because card-detail "decks featuring this card" reuses the same `deck_cards` join that already powers user-deck card lookups; we filter on `EXISTS (tournaments_decks)` to restrict to the archive.
- Good, because `share_token` on `decks` already serves as a permalink slug; tournament-deck URLs reuse it instead of inventing a parallel slug column.
- Bad, because `decks` queries that don't expect tournament rows (e.g. "my decks", "public decks browse") need a filter to exclude the `tournament-archive` owner. Mitigated by a single repo-level helper (`excludeTournamentArchive()`) applied at the read boundary.
- Bad, because the synthetic owner is technically editable by anyone with that user's session — except the seeded user has no email/credentials and cannot authenticate, so the only write path is the admin server function gated by the admin role.
- Bad, because tournament decks aren't frozen — an admin editing a `decks` row retroactively changes "history." We accept this in exchange for code reuse; if it becomes a problem we add an immutability flag, not a separate table.

## Design Decisions

### Synthetic owner: `tournament-archive`

A migration seeds a single row in `users` with a reserved id (e.g. `tournament-archive`), no email, no password hash, and no OAuth links. The auth system cannot produce a session for this user. All tournament decks have `decks.user_id = 'tournament-archive'` and `is_public = true`. The synthetic user is rendered as **"Tournament Archive"** on any UI that would otherwise show an owner.

Why a single shared owner rather than per-pilot users: we deliberately chose **free-text player names** (no link to OpenRift accounts, no `players` table). Creating a real user for every pilot would imply login affordances we are not building.

### Tournament event entity

`tournaments` is first-class: events have their own page, their own slug, and their own permalink. Fields:

- `id uuid` — primary key, uuidv7.
- `slug text` — URL-safe, `[a-z0-9][a-z0-9-]{2,49}`, unique, **mutable with no redirect**. Same policy as ADR-013 friend groups: small audience, low collision risk; renamed slugs 404. Reserved-slug list (`new`, `decks`, `meta`, `run`, `admin`, etc.) prevents collisions with app routes (`run` is reserved for the ADR-022 runner subtree).
- `name text` — display name, 1–120 chars.
- `event_date date` — single date. Multi-day events store the start; the source URL or notes carry the detail.
- `format text` — same string vocabulary as `decks.format` so filters compose.
- `player_count integer` — nullable; some events don't publish.
- `organizer text` — nullable; free text (e.g. "Riot Games", "LGS Berlin", "Nexus Night Munich").
- `source_url text` — nullable; the canonical external link (riftdecks page, Twitch VOD, blog post).
- `notes text` — nullable markdown, 4 000 char max; admin-only event description shown on the event page.
- `created_at`, `updated_at timestamptz`.

**Intentionally omitted in MVP:** location/region (covered by event name + organizer for the events we care about), spread-over-multiple-days representation, ranking system, registration link, multiple formats per event.

### `tournaments_decks` satellite

One row per (tournament, deck) pairing. Deck is the PK because a `decks` row can only belong to one event.

- `deck_id uuid` — PK, references `decks(id)` ON DELETE CASCADE.
- `tournament_id uuid` — references `tournaments(id)` ON DELETE CASCADE.
- `player_name text` — 1–80 chars, NOT NULL. Free text; no link to OpenRift users.
- `finish_tier integer` — 1, 2, 3, 4, 8, 16, … (positive integer). Lower = better. Display rendering:
  - 1 → "1st", 2 → "2nd", 3 → "3rd"
  - ≥ 4 → "T<n>" (e.g. 4 → "T4", 8 → "T8")
    Two decks at the same `finish_tier` in the same event are treated as tied for display and sort.
- `created_at`, `updated_at timestamptz`.

We do **not** add a separate slug column. The URL slug for a single tournament deck is `decks.share_token` (the existing 12-char base62 token from `generateShareToken()` in `apps/api/src/utils/share-token.ts`). The admin-create-tournament-deck server function always populates `share_token` if absent; rotation of the share token after creation is disallowed for tournament decks (the API rejects the rotate request when a `tournaments_decks` row exists) so permalinks stay stable.

### Card list, formats, champions

Card lists live in the existing `deck_cards` table — no changes, no second-card-list schema, no snapshot copy. Format is the existing `decks.format` text column. Champion / signature card detection reuses whatever the deck-builder already does today. Tournament decks are decks; they obey the same rules.

Identity of cards in the list matches whatever `deck_cards` already uses. The collection overlay sums copies across all printings of the underlying card so a user with the reprint counts as having the card the tournament pilot played.

### Visibility and ownership rules

- `decks.is_public = true` for every tournament deck so the SSR routes render them anonymously.
- `decks.user_id = 'tournament-archive'` for every tournament deck.
- Read endpoints (cross-event browse, event detail, card-detail reverse link) are unauthenticated.
- Write endpoints (create tournament, create tournament deck, edit either, delete either) require the `admin` role. The server checks both the role and the synthetic owner; a non-admin cannot impersonate the archive user even if they somehow obtain its id.
- User-facing "my decks", "public decks" surfaces apply `excludeTournamentArchive()` so the archive doesn't pollute either list.

### Fork: pure copy, no back-link

A logged-in user clicking "Fork to my decks" on `/tournaments/$slug/$shareToken` triggers a server function that:

1. Inserts a new `decks` row owned by the requester, `is_public = false`, `is_pinned = false`, `archived_at = NULL`, `format` and `format_config` copied verbatim, `name = original_name`, `share_token = NULL` (lazily generated when the user shares).
2. Copies every `deck_cards` row from the source deck to the new deck.
3. Does **not** insert a `tournaments_decks` row. The forked deck has no relationship to the event.
4. Redirects to the new deck in the user's deck-builder.

No `forked_from_*` metadata is recorded. The two decks diverge permanently. This is a deliberate choice over "soft fork" or "back-linked fork" — the user wants a starting template, not a tracking relationship.

### Meta stats (MVP scope)

Two aggregates ship in MVP, both live-queried (no materialised view, no in-memory cache) until pressure shows up:

- **Card inclusion %** per `(format, date_range)`: `count distinct decks containing card / count distinct decks in scope`. Available on `/tournaments/meta` (the dedicated meta panel) filtered by the standard chips (format, date range).
- **Champion / signature play-rate** per `(format, date_range)`: the same shape, but grouped by champion id. Drives the meta page's "top champions" panel and informs the champion filter chip on the deck-browse page.

Both stats power surfaces that already exist in the route plan below; we do not add a separate stats route. Archetype share, trend lines over time, win-rate analysis, deck similarity clustering, and "decks like this one" are deferred.

### User experience surfaces

#### Routes

- **`/tournaments`** — the shared hub (see ADR-022): it offers "Browse decks & meta" (this archive) and "Run a tournament" (the ADR-022 runner). The archive's event index lives here, sorted by `event_date desc`. Each row: event name, date, format, player count, organizer, count of decks in archive, link to event page. Filters: format, date range. SSR public.
- **`/tournaments/$slug`** — single event page. Event metadata header (name, date, format, player count, organizer, source URL, notes), then the list of decks for this event ordered by `finish_tier asc`. Each deck row uses the same compact deck card as the deck-builder list, with a "T8 — Player Name" badge prefix. SSR public.
- **`/tournaments/$slug/$shareToken`** — single tournament deck. Renders the existing deck-detail page with an **Event** sidebar (tournament name + date + format → link back to `/tournaments/$slug`, finish position, player name) and a **Fork to my decks** CTA. For logged-in users, the existing deck-collection overlay computes missing-cards / completion %. SSR public.
- **`/tournaments/decks`** — cross-event deck browser with filters: format, date range, event(s) multi-select, finish position (winner / top 4 / top 8 / top 16 / any), champion. Filter chips render in the active-filters bar with the existing card-browser scaffold. SSR public.
  - This route also accepts a `card=$cardId` query param (set by the card-detail reverse link below) which adds a removable "contains card X" chip. The chip surface is identical to the others, but there is no explicit "contains card" picker in the filter UI — the chip is only set via the card-page link. A future ADR can promote it to a full multi-card picker if the use case warrants it.
- **`/tournaments/meta`** — meta stats panel: card inclusion % table, champion play-rate panel. Filters: format + date range (chips, same UX as the deck browser). SSR public.
- **`/admin/tournaments`** — admin-only. List of events with "Create" CTA; per-event detail page lets the admin add/edit decks one at a time via a form (paste card list, set player_name + finish_tier). No bulk import in MVP.

#### Card-detail reverse link

The card detail page gains one new section: **"Tournament decks featuring this card"**. The section is just a link to `/tournaments/decks?card=$cardId`. No inline stats on the card page in MVP — the meta page is where stats live. The link is rendered for everyone (anonymous + logged-in); it shows nothing surface-specific that requires auth.

#### Cross-surface integration

The catalog (`/cards`), collection (`/collections`), deck builder (`/decks/$id`), and promos pages stay tournament-agnostic — no badges, no per-cell tournament queries. The only cross-surface entry is the card-detail reverse link above. This keeps the perf surface to the routes that explicitly do the join and prevents the per-row component cost from growing on the browse-heavy pages.

The deck-builder explicitly excludes tournament decks from the user's "my decks" sidebar and from any "my public decks" surface via `excludeTournamentArchive()`.

#### Empty states

- **No tournaments yet.** `/tournaments` shows "No tournaments archived yet." Admin-only CTA: "Add the first one."
- **No decks in this event.** `/tournaments/$slug` shows "We haven't archived any decks from this event yet."
- **No matching decks.** `/tournaments/decks` shows "No tournament decks match these filters. Try clearing the date range or champion."
- **Empty card-detail reverse link.** Card page shows "Not played in any archived tournament deck yet."

## Schema sketch

```sql
-- Seed via migration; the auth system rejects login because email/credentials are NULL.
-- INSERT INTO users (id, display_name) VALUES ('tournament-archive', 'Tournament Archive');

CREATE TABLE tournaments (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  slug          text NOT NULL UNIQUE
                  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  event_date    date NOT NULL,
  format        text NOT NULL,
  player_count  integer CHECK (player_count IS NULL OR player_count > 0),
  organizer     text CHECK (organizer IS NULL OR length(organizer) BETWEEN 1 AND 120),
  source_url    text CHECK (source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000),
  notes         text CHECK (notes IS NULL OR length(notes) <= 4000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournaments_event_date ON tournaments (event_date DESC);
CREATE INDEX idx_tournaments_format     ON tournaments (format);

CREATE TABLE tournaments_decks (
  deck_id        uuid PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  tournament_id  uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_name    text NOT NULL CHECK (length(player_name) BETWEEN 1 AND 80),
  finish_tier    integer NOT NULL CHECK (finish_tier BETWEEN 1 AND 1024),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournaments_decks_tournament_finish
  ON tournaments_decks (tournament_id, finish_tier);
CREATE INDEX idx_tournaments_decks_tournament
  ON tournaments_decks (tournament_id);
```

The tournament-deck URL slug is `decks.share_token`; no slug column is added here.

## Will Not Be Built

- **User submissions / community-curated entries.** No submission form, no moderation queue, no trusted-curator role. The archive is admin-only. If this ever changes, it is a new ADR with its own anti-spam design.
- **External scraping / imports.** No riftdecks.com scraper, no Discord-post parser, no automated ingest of any kind. Each tournament and each deck is entered by hand through the admin UI. The source URL is a back-reference, not a fetch target.
- **Trade execution from a tournament deck.** Tournament decks integrate with the catalog and collection (and, transitively, with friend-group tradelist matches once ADR-013 lands), but they do not model trade proposals or two-sided exchanges. The "trade sessions" stance from ADR-013 applies here unchanged.
- **Player profiles.** Player names are free text. There is no `players` table, no link from a `tournaments_decks` row to an OpenRift `users` row, no claim flow ("this is me"), and no "all decks by Player X" aggregation. If a pilot has an OpenRift account, we do not surface that fact.

## Deferred / Out of Scope

- **Archetype labels and taxonomy.** No archetype field in MVP; champion + signature card already imply the archetype to a reader. Add later only if meta-stats demand it.
- **Full standings beyond the top cut.** Only entered top-cut decks exist as rows. We do not model "64-player event, 4 decklists known" — only the 4 decklists are present.
- **Snapshot freezing.** Tournament decks are normal `decks` rows; admin edits are live and rewrite history. We accept this for code reuse.
- **"Forked from" back-link metadata.** Forks are pure copies with no upstream reference. No "forked N times" stat, no "see decks forked from this one."
- **Slug history / redirects.** Renamed tournament slugs 404. No `slug_history` table.
- **Multi-card "contains card" filter UI.** The `card=$id` query param is wired (driven by the card-detail link), but the visible filter UI has no card picker. Promote to a real picker only if the use case appears.
- **Bulk admin import.** No CSV upload, no paste-multiple-decks form. Admin enters decks one at a time.
- **Card-detail inclusion % stat.** The card page shows the reverse link only. The inclusion % stat lives on `/tournaments/meta`, not on the card detail page.
- **Champion play-rate trend over time, archetype share, win-rate analysis, deck-similarity clustering.**
- **Materialised views or caching of inclusion %.** Live SQL until it shows pressure.
- **Notification surfaces.** No "new tournament" notification, no "new deck for the champion you watch."
- **Location / region on `tournaments`.** Covered by event name + organizer.
- **Multiple formats per event** (e.g. a multi-format major).
- **Per-event registration links, ranking, prize structure.**
- **Tournament-aware overlays on the catalog, collection, or deck-builder browse pages.** Only the card-detail page integrates.

## Confirmation

Schema-level invariants exercised by integration tests:

- `tournaments.slug` matches the URL pattern and rejects reserved names (`new`, `decks`, `meta`, `run`, `admin`).
- Deleting a `tournaments` row cascades to its `tournaments_decks` rows, which cascade to the underlying `decks` rows (and their `deck_cards`).
- Deleting a `decks` row cascades to its `tournaments_decks` row.
- The `tournament-archive` user cannot authenticate (auth lookup returns no candidate).
- Only the `admin` role can create or update rows in `tournaments` or `tournaments_decks`; non-admin requests get 403.
- Every `decks` row referenced by `tournaments_decks` has `user_id = 'tournament-archive'` and `is_public = true` — an admin-write hook enforces both fields.
- Rotating `share_token` on a deck that has a `tournaments_decks` row returns an error so tournament permalinks stay stable.
- Fork creates a new `decks` row owned by the requester with `is_public = false`, copies all `deck_cards` rows, and does **not** insert a `tournaments_decks` row.

Read-path behaviour exercised by vitest tests:

- `/tournaments`, `/tournaments/$slug`, `/tournaments/$slug/$shareToken`, `/tournaments/decks`, and `/tournaments/meta` all render for an unauthenticated request.
- "My decks" and "Public decks" surfaces exclude `tournament-archive`-owned decks.
- `/tournaments/decks` filter combinations return the expected intersection (format, date range, event multi-select, finish tier, champion, `card=$id`).
- Card-detail reverse link targets `/tournaments/decks?card=$cardId` and the destination page renders the chip with the correct card label.
- Inclusion % and champion play-rate aggregates compute against a seeded fixture and match expected percentages.

## More Information

Relationship to other ADRs:

- **ADR-005 (collection tracking).** The "Can I build this?" overlay on the tournament deck detail page reuses the same per-deck completion computation that ADR-005 introduces for user decks. No new mechanism is required.
- **ADR-013 (friend groups).** Tournament decks remain group-agnostic — no friend-group surface integrates with them, no group can "share" a tournament deck. The cross-surface integration ADR-013 calls out (shopping list) does not extend to the tournament archive.
- **ADR-022 (FFA pod pairing).** Shares the `/tournaments` hub with this archive (this archive under the bare `/tournaments` routes, the runner under `/tournaments/run/`). Data stays separate: `pod_tournaments` and friends are independent of `tournaments` / `tournaments_decks`, with no foreign keys between the two. The only coordination is the shared hub page and the `run` reserved slug.
