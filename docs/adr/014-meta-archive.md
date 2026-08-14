---
status: accepted
date: 2026-08-14
---

# ADR-014: Meta Archive

> This is a full rewrite (2026-08-14) of the original 2026-06-08 "Tournament Decks Archive" proposal, which was never built. Since then, [ADR-033](033-unified-tournaments.md) claimed the `tournaments` table name and the `/tournaments` URL space for the unified tournament runner and formally released this ADR's reservations. The rewrite keeps the original's core data-model decision and re-homes everything else. The old text survives only in git history.

## Context and Problem Statement

Players researching the Riftbound meta currently hop over to riftdecks.com, which carries tournament results and their decklists. The lists there work, but they are decoupled from anything OpenRift knows about you: cards do not link to the catalog, there is no "do I own this?" overlay against your collection, and there is no way to fork a list into your own decks.

OpenRift has a complete decks subsystem (`decks` rows, `deck_cards`, formats, legend/champion zones, share tokens, deck codes, the deck builder) built around per-user ownership. We want a publicly browsable, admin-curated archive of competitive decklists with meta statistics, integrated with the catalog and collection.

The decision is how to model archived decks (separate world vs. reuse `decks`), where event metadata lives, how the read-only archive coexists with user-owned decks, and, new since ADR-033, how it relates to the tournament runner and where it lives now that `/tournaments` is taken.

## Decision Drivers

- **Reuse, don't duplicate.** The existing `decks` schema, deck rendering, legend/champion logic, deck codes, and share-token routing are exactly what we'd build for archived decks anyway. A parallel table pair would mean two of every query, component, and test.
- **Catalog and collection integration is the value-add.** Every card links to its catalog page; the collection overlay computes missing copies for logged-in users without bespoke wiring.
- **Public + crawlable.** Archive pages are unauthenticated, SSR'd, and SEO-friendly. They are the entry funnel from Google searches for specific decks or legends.
- **Curated, not user-generated.** Every event and deck enters the archive through an admin: typed in by hand, or proposed as a candidate by external tooling and explicitly accepted (see Candidate ingest below). No community submission flow, no moderation queue. Curation cost is acceptable because each event contributes a small top-cut handful and events are rare (one per week or two).
- **Separate from the runner.** The ADR-033 runner (`tournaments`) holds real player-submitted decks, but publishing those raises consent questions and couples two products. The archive stays its own world; a promote-from-runner flow would be its own ADR.
- **Event metadata is intentionally light.** riftdecks already handles event metadata fine. We match it, not exceed it.

## Considered Options

Data model (unchanged from the original proposal):

- **Reuse the `decks` shape with a synthetic owner + satellite `meta_decks` table.** Archived decks ARE rows in `decks`, owned by a single seeded system user, with a satellite row carrying event, finish, and player name.
- **Separate snapshot tables.** A new immutable table pair independent of the user-deck schema. Forking copies into `decks`.
- **Flag/extend `decks` with denormalised event columns.** Every `decks` query has to know about event columns even when they're NULL.

## Decision Outcome

We reuse the `decks` shape with a synthetic owner plus satellite `meta_events` / `meta_decks` tables, fully independent of the runner's `tournaments` tables, surfaced under a new top-level `/meta` route with a "Meta" header-nav entry.

### Consequences

- Good, because the deck rendering, deck-code import, legend/champion detection, and collection completion overlay are inherited with zero new mechanisms.
- Good, because fork is the existing "duplicate deck" mutation with the requester as the new owner, and the logged-out equivalent is the existing anonymous-builder import (ADR-035).
- Good, because `decks.share_token` already serves as a permalink slug; archived-deck URLs reuse it instead of inventing a parallel slug column.
- Good, because the runner and the archive share nothing but the word "tournament", so neither constrains the other's evolution.
- Neutral, because no exclusion filter turned out to be needed: every user-facing deck read is scoped by `user_id` or share token, so archive decks are structurally invisible outside `/meta`. Only admin-only surfaces (the user list, status counts) see the synthetic owner.
- Bad, because archived decks aren't frozen: an admin editing a `decks` row retroactively changes "history." Accepted in exchange for code reuse; if it becomes a problem we add an immutability flag, not a separate table.
- Bad, because `users.email` is NOT NULL, so the synthetic owner carries a placeholder address. It has no `accounts` row, so no credential or OAuth path can produce a session for it.

## Design Decisions

### Synthetic owner: `meta-archive`

A migration seeds one row in `users`: id `meta-archive` (`users.id` is text), a reserved placeholder email on a non-routable domain, `email_verified = false`, and no `accounts` row, so the auth system cannot produce a session for it. All archived decks have `decks.user_id = 'meta-archive'` and `is_public = true`.

The synthetic user is never rendered. Public surfaces show a player/event byline instead (see Surfaces below). Pilots stay free-text names: no `players` table, no link to OpenRift accounts.

### `meta_events`

Events have their own page, slug, and permalink. Fields:

- `id uuid`: primary key, uuidv7.
- `slug text`: URL-safe, `[a-z0-9][a-z0-9-]{2,49}`, unique, mutable with no redirect (same policy as ADR-013 friend groups: small audience, renamed slugs 404). Reserved-slug list: `decks`, `events`, `stats`, `new`, `admin`.
- `name text`: display name, 1–120 chars.
- `event_date date`: single date. Multi-day events store the start.
- `format text`: same vocabulary as `decks.format` so filters compose.
- `player_count integer`: nullable.
- `organizer text`: nullable, free text (e.g. "Riot Games", "LGS Berlin").
- `source_url text`: nullable, the canonical external link (riftdecks page, Twitch VOD, blog post), rendered as a public attribution link on the event page.
- `notes text`: nullable markdown, 4 000 char max, shown on the event page.
- `created_at`, `updated_at timestamptz`.

Intentionally omitted: location/region, multi-day representation, standings, registration links, multiple formats per event.

### `meta_decks` satellite

One row per (event, deck) pairing. Deck is the PK because a `decks` row can only belong to one event.

- `deck_id uuid`: PK, references `decks(id)` ON DELETE CASCADE.
- `meta_event_id uuid`: NOT NULL, references `meta_events(id)` ON DELETE CASCADE.
- `player_name text`: 1–80 chars, NOT NULL. Free text.
- `finish_tier integer`: 1, 2, 3, 4, 8, 16, … Lower = better. Display: 1 → "1st", 2 → "2nd", 3 → "3rd", ≥ 4 → "T\<n\>". Equal tiers in one event are ties for display and sort.
- `record text`: nullable free text ("5-1", "4-0-2"), 1–20 chars, shown on deck rows.
- `list_status text`: NOT NULL, default `full`, CHECK one of three values. How much of the pilot's list `deck_cards` actually holds. Sources publish at three levels of detail and the archive keeps them apart rather than guessing from the card count:
  - `full`: the pilot's whole list.
  - `partial`: the main deck is complete; the side zones (battlefields, runes, sideboard) may be missing. **Card inclusion reads the main zone alone, so a partial list counts there exactly like a full one** — this is the state that makes the distinction worth having, because a source that ships every main-deck card but no battlefields is publishing usable meta data.
  - `archetype`: the main deck is unknown; the rows are the legend and, where the source named one, the champion.
- `created_at`, `updated_at timestamptz`.

All three states are ordinary archived decks whose `deck_cards` hold exactly what the source gave, and all three count in legend play-rate and the legend filters. Only `archetype` is left out of card inclusion, and only `archetype` has no page.

The public URL slug for an archived deck is `decks.share_token` (the existing 12-char base62 token from `apps/api/src/lib/share-token.ts`), populated at creation for every deck with a known main deck. An `archetype` has nothing to render, so it gets no token and never appears in the sitemap, which iterates tokens. Promoting a deck out of `archetype` mints the token then, which is the point the page starts existing; a demotion back does not take the token away, because the read path refuses an archetype whatever its token says. Rotating the share token is rejected while a `meta_decks` row exists, so permalinks stay stable.

### Card lists, formats, legends

Card lists live in `deck_cards` unchanged: no second card-list schema, no snapshot copy. Format is `decks.format`. The deck's legend and champion come from the existing legend/champion zones (`packages/shared/src/deck-rules.ts` vocabulary). Archived decks are decks and obey the same rules. The collection overlay sums copies across all printings of the underlying card.

### Relationship to the runner

None. No foreign keys between `meta_events`/`meta_decks` and the runner's `tournaments` tables, no promote flow, no shared UI. If publishing a completed runner tournament's decks into the archive ever becomes a feature, that is a new ADR with its own consent design.

### Visibility and ownership rules

- Read endpoints (overview, event page, deck browser, deck page) are unauthenticated.
- Write endpoints (create/edit/delete events and archived decks) require the `admin` role. The server checks both the role and the synthetic owner; a non-admin cannot impersonate the archive user even with its id.
- "My decks" reads apply `excludeMetaArchive()` so the archive never appears in a user's own list.

### Fork: pure copy, no back-link

- **Logged in:** "Fork to my decks" duplicates the deck for the requester (`is_public = false`, `share_token = NULL`, `deck_cards` copied, no `meta_decks` row) and opens it in the deck builder.
- **Logged out:** "Open in deck builder" creates a local anonymous deck (ADR-035) from the card list, client-side.

No `forked_from` metadata in either path. The copies diverge permanently.

### Meta stats (MVP scope)

Two aggregates, both live-queried (no materialised view, no cache) until pressure shows up, filtered by format and date range:

- **Card inclusion %**: distinct archived decks whose main deck contains the card / distinct archived decks in scope **whose main deck is known** (`full` and `partial`). Only the main deck counts: every list carries its battlefields and runes, so counting all zones would top the table with cards nobody chose. `archetype` decks are excluded from both halves and the response carries that second denominator separately, so the panel can say how many main decks it read rather than silently deflating every percentage.
- **Legend play-rate**: the same shape grouped by the deck's legend. The legend is the grouping axis throughout the archive (stats and the deck-browser filter); the champion is displayed on deck rows but is not an axis.

### Surfaces

Routes, all SSR public:

- **`/meta`**: the overview page. Stats panels (card inclusion table, top legends) plus the event list sorted by `event_date desc` (name, date, format, player count, organizer, deck count). Format and date-range filters drive both.
- **`/meta/$slug`**: single event page. Metadata header (name, date, format, player count, organizer, source link, notes), then its decks ordered by `finish_tier asc`, each with a finish/player/record badge.
- **`/meta/decks`**: cross-event deck browser using the decks-list filter pattern (URL-held filters, combobox controls, active-filter chips; the card-browser scaffold is card-cell machinery and does not fit deck tiles). Filters: format, date range, event multi-select, finish (winner / top 4 / top 8 / top 16 / any), legend. The whole archive is fetched once and filtered client-side.
- **`/meta/decks/$token`**: single archived deck. Reuses the public deck-share surface (the `/decks/share/$token` component) with the archive's facts (finish, player, record, event link, date) in the hero byline in place of an owner, and the fork CTA. Collection completion renders for logged-in users as on any shared deck.
- **`/admin/meta`**: admin-only event list with create/edit, plus a Candidates tab for the ingest pipeline below. Decks are created through a deck-code paste under the archive owner (with a small form for event, player name, finish tier, and record), or accepted from candidates.

The byline for an archived deck everywhere (deck page header, deck rows, tiles) is player + finish + event, never an account owner.

Navigation: a "Meta" entry in the main header. The catalog, collection, deck builder, and promos pages stay archive-agnostic in MVP; even the card-detail reverse link is deferred (see below).

Empty states: "/meta" shows "No events archived yet." with an admin-only CTA; an empty event page shows "We haven't archived any decks from this event yet."; the deck browser shows "No decks match these filters."

### Candidate ingest

Filling event pages by hand does not scale past the first few events, so the archive reuses the ADR-008 candidate pattern: external tooling produces candidate JSON and pushes it; nothing goes live without an explicit admin accept. The application only knows the candidate schema, so sources can live anywhere and evolve independently.

- **Upload.** `POST /api/admin/v1/meta/upload` with `{ provider, events: [...] }`, each event carrying its fields plus decks (player, finish, record, and a card list). Auth is the existing admin API key mechanism (`x-api-key` resolves to an admin session); no new auth machinery, no new caller identity tier.
- **Per-event replace.** Each uploaded event wholly replaces its own candidate (event fields and decks alike); events absent from the payload are untouched. There is no provider-wide replace: a full provider dump could be huge, and partial pushes must stay safe. Uploads are idempotent; in-payload duplicate `external_id`s keep the first occurrence and report the rest.
- **Staging.** `candidate_meta_events` + `candidate_meta_decks`. Events are keyed by `(provider, external_id)`; deck external ids are scoped to their event, since sources number their lists per event, so a deck is keyed by `(provider, event external_id, external_id)` everywhere the key leaves its candidate row. Providers are implicit — a new string is a new provider. Deck card lists are jsonb on the candidate (`{ name, zone, quantity, card_id }`), not a third staging table. `checked_at` marks "an admin reviewed this" and resets whenever an upload changes the row, so updated events re-enter the queue. `extra_data` jsonb carries source fields that map to nothing.
- **Card matching.** Payloads carry card _names_; ingest resolves them through the same normalized-name + `card_name_aliases` matching the card pipeline uses, so an alias fix made once applies to every future upload from any source. Unmatched names are stored as-is and surfaced per deck; a deck cannot be accepted until every card resolves.
- **Partial and archetype lists.** An upload deck carries `listStatus` (`full` / `partial` / `archetype`, default `full`), the source's own claim about how much of the list it is sending. It is never inferred from the card count: a short list, a list missing its battlefields, and a deliberate archetype are three different statements. Accepting copies it onto `meta_decks.list_status`; an `archetype` additionally requires a legend-zone row that resolved, since the legend is the archive's grouping axis and an entry filed under none is not worth having. A later push changing the status is a source change like any other: the candidate re-enters the queue and the diff names the transition. Accepting a promotion out of `archetype` fills in the list and mints the deck's token.
- **Linking and accept.** Live `meta_events` rows carry nullable `source_provider` + `source_external_id`, and `meta_decks` rows carry those plus `source_event_external_id`; each set is unique where fully populated, and all are written at accept time. An unlinked candidate accepts into a new event or deck (deck creation reuses the admin create path: `decks` row under the archive owner, cards, satellite row). A linked candidate shows a diff against the live row and accepting applies it — corrections and late decklists flow through the same queue. Accepts are whole-entity with a diff view, not the card pipeline's per-field compare grid: that grid exists because many providers disagree per field, and the archive has one or two sources.
- **Rejection.** `ignored_candidate_meta_events` keyed on `(provider, external_id)`, `ignored_candidate_meta_decks` on `(provider, event_external_id, external_id)`; ingest skips ignored keys so junk never resurfaces. The deck key names the source's event rather than the candidate row, so it survives that event's candidate being deleted and re-created.
- **No outcome ledger.** The ADR-036 submissions ledger exists so outside contributors can see what happened to their submission. Candidate sources here are the maintainer's own tooling, so staging's presence semantics suffice.

### Launch

Ships behind a `meta` feature flag (registered in `KNOWN_FLAGS`). Seed a handful of real events behind the flag, then flip it on. No changelog entry until launch (same policy as the glossary).

## Schema sketch

```sql
-- Seed via migration; no accounts row exists, so auth cannot produce a session.
-- INSERT INTO users (id, email, name) VALUES ('meta-archive', '<placeholder>', 'Meta Archive');

CREATE TABLE meta_events (
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

CREATE INDEX idx_meta_events_event_date ON meta_events (event_date DESC);
CREATE INDEX idx_meta_events_format     ON meta_events (format);

CREATE TABLE meta_decks (
  deck_id        uuid PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  meta_event_id  uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  player_name    text NOT NULL CHECK (length(player_name) BETWEEN 1 AND 80),
  finish_tier    integer NOT NULL CHECK (finish_tier >= 1),
  record         text CHECK (record IS NULL OR length(record) BETWEEN 1 AND 20),
  -- 'archetype' is the one state that carries no share token.
  list_status    text NOT NULL DEFAULT 'full'
                   CHECK (list_status IN ('full', 'partial', 'archetype')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_decks_event_finish ON meta_decks (meta_event_id, finish_tier);

-- Candidate ingest (sketch). Live meta_events additionally gains nullable
-- source_provider + source_external_id, and meta_decks those plus
-- source_event_external_id; each set is unique where fully populated, written
-- at accept time so re-uploads link and diff.

CREATE TABLE candidate_meta_events (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  provider       text NOT NULL,
  external_id    text NOT NULL,
  name           text NOT NULL,
  event_date     date NOT NULL,
  format         text NOT NULL,
  -- player_count / organizer / source_url / notes as on meta_events, nullable
  meta_event_id  uuid REFERENCES meta_events(id) ON DELETE SET NULL,
  checked_at     timestamptz,
  extra_data     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE candidate_meta_decks (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  candidate_event_id  uuid NOT NULL REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
  external_id         text NOT NULL,
  player_name         text NOT NULL,
  finish_tier         integer NOT NULL,
  record              text,
  name                text,
  cards               jsonb NOT NULL,  -- [{ name, zone, quantity, card_id | null }]
  list_status         text NOT NULL DEFAULT 'full'
                        CHECK (list_status IN ('full', 'partial', 'archetype')),
  deck_id             uuid REFERENCES decks(id) ON DELETE SET NULL,
  checked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_event_id, external_id)
);

-- ignored_candidate_meta_events: (provider, external_id, created_at).
-- ignored_candidate_meta_decks: (provider, event_external_id, external_id,
-- created_at). Both skip-at-ingest.
```

## Will Not Be Built

- **User submissions / community-curated entries.** Admin-only. If this ever changes, it is a new ADR with its own anti-spam design.
- **In-app scraping or fetching.** The application never pulls from external sites: `source_url` is a back-reference, not a fetch target, and ingest is push-only (external tooling uploads candidate JSON; an admin accepts each entry). How sources produce their JSON is outside this system.
- **Player profiles.** Free-text names only: no claim flow, no "all decks by Player X" aggregation, no surfacing that a pilot has an OpenRift account.
- **Trade execution from an archived deck.** Collection integration only; the ADR-013 "trade sessions" stance applies unchanged.

## Deferred / Out of Scope

- **Promote-from-runner.** Publishing a completed ADR-033 tournament's submitted decks into the archive. Needs its own consent design.
- **Card-detail reverse link and the `card=$cardId` deck-browser chip.** The card page gets no archive section in MVP; both ship together as one fast-follow.
- **Archetype labels.** Legend + champion already imply the archetype to a reader.
- **Full standings beyond the entered top cut.**
- **Snapshot freezing, forked-from metadata, slug history/redirects.**
- **Trend lines, win-rate analysis, deck-similarity clustering, materialised stat views.**
- **Notifications** ("new event", "new deck for your legend").
- **Location/region on events, multi-format events, prize/registration metadata.**

## Confirmation

Schema-level invariants exercised by integration tests:

- `meta_events.slug` matches the URL pattern and rejects reserved names (`decks`, `events`, `stats`, `new`, `admin`).
- Deleting a `meta_events` row cascades to its `meta_decks` rows; deleting a `decks` row cascades to its `meta_decks` row.
- The `meta-archive` user cannot authenticate (no accounts row, auth lookup returns no candidate).
- Only the `admin` role can write `meta_events` or `meta_decks`; non-admin requests get 403.
- Every `decks` row referenced by `meta_decks` has `user_id = 'meta-archive'` and `is_public = true`; the admin write path enforces both.
- Rotating `share_token` on a deck with a `meta_decks` row returns an error.
- Fork creates a new `decks` row owned by the requester with `is_public = false`, copies all `deck_cards` rows, and inserts no `meta_decks` row.
- Upload replaces exactly the uploaded events' candidates (decks included), leaves other candidates untouched, skips ignored keys, resets `checked_at` on changed rows, and reports in-payload duplicate external ids.
- Accepting an unlinked candidate creates the live rows with `source_provider`/`source_external_id` set; accepting a linked one applies the diff; a deck with an unresolved card name cannot be accepted.
- The upload endpoint requires an admin (API-key session included); non-admin keys get 403.

Read-path behaviour exercised by vitest tests:

- `/meta`, `/meta/$slug`, `/meta/decks`, and `/meta/decks/$token` all render for an unauthenticated request.
- "My decks" excludes `meta-archive`-owned decks.
- Deck-browser filter combinations return the expected intersection (format, date range, event multi-select, finish tier, legend).
- Inclusion % and legend play-rate compute against a seeded fixture and match expected percentages.

## More Information

- **ADR-005 (collection tracking):** the completion overlay on the archived deck page is the same per-deck computation user decks use.
- **ADR-008 (supplemental card import):** the candidate ingest copies its pattern — source-agnostic candidate JSON, implicit providers, presence semantics, ignore tables — with per-event replace instead of provider-wide replace and whole-entity accept instead of the per-field compare grid.
- **ADR-033 (unified tournaments):** owns the `tournaments` tables and `/tournaments` routes. This archive shares no data or UI with the runner.
- **ADR-035 (anonymous deck builder):** provides the logged-out "Open in deck builder" path via the existing client-side deck import.
- Original 2026-06-08 proposal: git history of this file (then `014-tournament-decks.md`).
