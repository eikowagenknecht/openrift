---
status: accepted
date: 2026-08-14
---

# ADR-014: Meta Archive

> This is a full rewrite (2026-08-14) of the original 2026-06-08 "Tournament Decks Archive" proposal, which was never built. Since then, [ADR-033](033-unified-tournaments.md) claimed the `tournaments` table name and the `/tournaments` URL space for the unified tournament runner and formally released this ADR's reservations. The rewrite keeps the original's core data-model decision and re-homes everything else. The old text survives only in git history.

> **Amended 2026-08-18.** The archive was designed for one source per event. It has four: uvsgames (official, decklists often missing), playriftbound.com (most top-8 lists), signed-in users, and hand entry. Four decisions changed, each in the section named:
>
> - **Multi-source events** drops the single `source_provider` / `source_external_id` key from the live rows. The link lives only on the candidate side now, as it does for printings in [ADR-008](008-supplemental-card-import.md), so several sources fan into one live event.
> - **Source citations** replaces `meta_events.source_url` with a `meta_event_sources` list, because two sources means two credits on one page.
> - **Review screen** adopts the card pipeline's per-field compare grid, which this ADR originally declined on the grounds that the archive had one or two sources.
> - **User submissions** and **Contributor credit** supersede the "no community submission flow" driver and the matching Will Not Be Built entry. The anti-spam design is [ADR-036](036-in-app-user-submissions.md)'s, applied unchanged, so there is no separate ADR.

## Context and Problem Statement

Players researching the Riftbound meta currently hop over to riftdecks.com, which carries tournament results and their decklists. The lists there work, but they are decoupled from anything OpenRift knows about you: cards do not link to the catalog, there is no "do I own this?" overlay against your collection, and there is no way to fork a list into your own decks.

OpenRift has a complete decks subsystem (`decks` rows, `deck_cards`, formats, legend/champion zones, share tokens, deck codes, the deck builder) built around per-user ownership. We want a publicly browsable, admin-curated archive of competitive decklists with meta statistics, integrated with the catalog and collection.

The decision is how to model archived decks (separate world vs. reuse `decks`), where event metadata lives, how the read-only archive coexists with user-owned decks, and, new since ADR-033, how it relates to the tournament runner and where it lives now that `/tournaments` is taken.

A second decision, added 2026-08-18: one tournament is described by several sources at once, and they hold different halves of it. uvsgames posts the official standings and often no lists; playriftbound.com posts the top-8 lists and a different event name; a player can fill a gap either site left; and some events only ever exist because the maintainer typed them in. A reader must see one event page. The maintainer must be able to curate it from all four without the archive growing a duplicate every time a second source publishes.

## Decision Drivers

- **Reuse, don't duplicate.** The existing `decks` schema, deck rendering, legend/champion logic, deck codes, and share-token routing are exactly what we'd build for archived decks anyway. A parallel table pair would mean two of every query, component, and test.
- **Catalog and collection integration is the value-add.** Every card links to its catalog page; the collection overlay computes missing copies for logged-in users without bespoke wiring.
- **Public + crawlable.** Archive pages are unauthenticated, SSR'd, and SEO-friendly. They are the entry funnel from Google searches for specific decks or legends.
- **Curated, never unreviewed.** Every event and deck enters the archive through an admin, whether typed in by hand, proposed by external tooling, or submitted by a signed-in user (see Candidate ingest and User submissions below). Nothing is public until a human accepts it. Curation cost is acceptable because each event contributes a small top-cut handful and events are rare (one per week or two).
- **One tournament, one page.** Sources disagree about names, hold different fields, and publish at different times. The reader sees a single event; reconciling the sources is the maintainer's job, and the tooling has to make it a few clicks rather than a merge by hand.
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
- Good (2026-08-18), because moving the source key off the live rows leaves the archive with fewer columns than it had, and the many-to-one fan-in it enables was already legal in the candidate FKs.
- Good (2026-08-18), because user submissions reuse ADR-036 end to end, so a second contributor entity costs a provider string, three nullable columns, and a ledger table.
- Bad (2026-08-18), because a second source no longer accepts in one click. It is confirm-the-match, then pick fields, and that step is new work for the maintainer on every event two sources cover.
- Bad (2026-08-18), because contributor names resolve at render, so a rename reaches public archive pages with no review in between.

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
- `source_url text`: **removed 2026-08-18.** One column held one link. Attribution is a list now: see Source citations below.
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

### Multi-source events

Two sources describing the same tournament have to land on one live event. The original design made that impossible. `meta_events` carried a single `source_provider` + `source_external_id` pair under a partial unique index, so a live row belonged to exactly one provider, and `meta_decks` carried the same key as a triple. A second provider's candidate could only accept into a second live event, and the public list would show the tournament twice.

The fix is the printings model from ADR-008. There, `printings` carries no provider columns at all; `candidate_printings.printing_id` is a nullable FK, so N candidates point at one live printing and an admin assigns the link. Here `candidate_meta_events.meta_event_id` and `candidate_meta_decks.deck_id` are already nullable N:1 FKs, so the fan-in was legal all along. What was missing is any way to create a link other than an accept minting a fresh row.

- The five `source_*` columns on `meta_events` and `meta_decks` are dropped, along with their partial unique indexes. The candidate FK is the only link, and the live tables carry no provider key.
- A re-upload finds its live target through its own candidate row, which is keyed `(provider, external_id)` and survives every upload, instead of through a live-side column. The uniqueness the dropped indexes gave is unchanged: one candidate holds one `meta_event_id`.
- Three admin actions at each level, named after the card pipeline's: **link** (point an unlinked candidate at an existing live row), **relink** (move it), **unlink**.
- Linking is separate from accepting. A source whose values you rejected still contributed, usually its decks, so the link and the citation it writes do not depend on taking any of its fields.
- A candidate deck may only link to a deck inside its own event's linked event.

**Match suggestions.** Doing this by hand every week is the friction that would kill the workflow, so ingest proposes and the admin confirms. Suggestions are ranked hints in the review UI, never applied automatically.

Two of the signals are hard filters rather than score contributors, because scoring them softly surfaced obvious nonsense: name similarity alone proposed the same recurring series a year apart, and `finish_tier` alone matched two unrelated pilots. So an event is only a candidate match when its `format` matches and its `event_date` is within three days, and a deck only when the normalized `player_name` overlaps. The scores order what passes those gates, and nothing else is offered.

Three days rather than one: a multi-day event gets filed under its first day by one source and its finals day by another, which is precisely the pair that has to link.

### Source citations

`meta_events.source_url` held one link. With uvsgames publishing the standings and playriftbound publishing the lists, the event page owes both a credit, so the column becomes a list:

```sql
CREATE TABLE meta_event_sources (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id  uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  provider       text,           -- NULL for a hand-entered citation
  external_id    text,           -- NULL likewise
  label          text NOT NULL,  -- what the page prints: "uvsgames", "Twitch VOD"
  source_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((provider IS NULL) = (external_id IS NULL))
);
CREATE UNIQUE INDEX uq_meta_event_sources_key
  ON meta_event_sources (provider, external_id) WHERE provider IS NOT NULL;
```

A provider row is written when its candidate is linked and removed when it is unlinked. A hand-entered row carries no provider key and exists so an admin transcribing from a VOD or a photo of the standings board can still cite it. An event with no rows shows no source line.

Citations answer "where did this data come from", and they are public. They never carry a user: a contributor is not a citation, and whatever a contributor cites becomes a hand-entered row only after an admin has read it. Deck-level citation is deferred. The event's list is enough while the event page is the archive's index, and if a deck page ever wants "list from playriftbound" it is this table pointed at `deck_id`.

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

### User submissions

A signed-in user can submit a decklist for an event the archive already has, or propose an event it does not. This supersedes the original admin-only stance. It needs no anti-spam ADR of its own because it is ADR-036's design applied to a second entity: the submission writes a candidate under a reserved provider, everything downstream is the review queue that already exists, and rejections go to the ignore table that already exists.

- **Provider.** `usersubmission`, the string ADR-036 reserved, keyed `(provider, external_id)` with a per-submission external id.
- **Target.** A user submits a deck, not an event dump, so a candidate deck must be able to hang off a live event directly. `candidate_meta_decks.candidate_event_id` becomes nullable, gains a sibling `meta_event_id`, and a CHECK requires exactly one of the two. A submission against an existing event takes the `meta_event_id` branch and invents no candidate event for itself.
- **Proposing an event.** A submission for an event the archive does not have has no live row to hang off, so it writes a real `candidate_meta_events` row under the same `usersubmission` provider and hangs its deck off that. It is a proposal sitting in the queue like any provider's, not a placeholder: an admin accepts or ignores it through the same actions. The ledger row keeps `meta_event_id` NULL and holds the name the submitter typed, so it still reads correctly if the event is never created.
- **Attribution on the candidate.** `submitted_by_user_id` and `submission_note`, copied from `candidate_cards`, both nullable, both admin-facing.
- **Ledger.** `meta_deck_submissions`, shaped like `card_submissions` (user, target, status, resolution reason and note, resolver, timestamps). The original "no outcome ledger" decision assumed every source was the maintainer's own tooling. A person who submits needs to see what happened to it.
- **Settling a row.** Accepting the candidate deck settles its ledger row to `accepted` and writes the credit. Every other outcome needs an explicit admin action, so the review queue carries a resolve control alongside accept: `rejected`, `not_applied`, or `already_correct` for the second person to send a list the archive already has, each with an optional note back to the submitter. Without it a declined submission reads as pending forever, and the ignore list is not a substitute: a user submission has no source event to ignore.
- **Anti-spam.** Per-user rate limiting, the admin ban lever, and the fact that nothing is public before an accept. The second person to submit the same top-8 list resolves as `already_correct`.

### Contributor credit

Credit is opt-in and public, because it is the reason a player bothers to type in a list at all. Several users contribute to one event, and the deck someone added is the thing they want their name on.

```sql
CREATE TABLE meta_credits (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id  uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  deck_id        uuid REFERENCES decks(id) ON DELETE CASCADE,  -- NULL: the event itself
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_meta_credits_contribution
  ON meta_credits (meta_event_id, user_id, deck_id) NULLS NOT DISTINCT;
```

One row per contribution, written as part of the accept it belongs to, and never for provider ingest or hand entry. Someone who adds four decks to one event gets four rows, which the event page groups into one name. The credit and the ledger row settle together in one transaction; the deck write itself stays outside it, because minting a share token retries on collision and cannot re-run inside an enclosing transaction.

Only candidate decks carry a submitter, so an event-level credit is derived rather than stored on the candidate event: accepting a proposed event credits the distinct submitters among its decks. Their ledger rows stay pending, because what each of them sent was a decklist, and that settles when the deck is accepted. The lookup is gated on the provider, so accepting a scraped event still costs no extra query.

The row stores the user id and nothing else. A frozen display name was considered and rejected: a credit list points at a person, so it should follow their rename, their profile fields, and their account deletion with no sweep across rows, and a contributor total ("11 decks contributed") is then a `GROUP BY` that stays accurate instead of one bucket per historical spelling.

Consent therefore cannot be the row's existence, since the name is resolved at render. It is a profile setting:

```sql
ALTER TABLE users ADD COLUMN meta_credit_visibility text NOT NULL DEFAULT 'hidden'
  CHECK (meta_credit_visibility IN ('hidden', 'name', 'riot_id'));
```

Rows are always written; the public read joins `users` and drops anyone still on `hidden`. Opting in later credits everything that user ever contributed, opting out removes it everywhere, and neither touches an archive row. `riot_id` chosen but unset falls back to `name`; `name` unset omits that contributor rather than printing part of a user id. There is no third free-text credit field, so nothing new to moderate.

The event page prints "Contributed by A, B and 2 others" under the source citations; a deck page prints its own contributor. Plain text, no profile links, because linking a credit to a share-token profile is a separate consent question.

### Meta stats (MVP scope)

Two aggregates, both live-queried (no materialised view, no cache) until pressure shows up, filtered by format and date range:

- **Card inclusion %**: distinct archived decks whose main deck contains the card / distinct archived decks in scope **whose main deck is known** (`full` and `partial`). Only the main deck counts: every list carries its battlefields and runes, so counting all zones would top the table with cards nobody chose. `archetype` decks are excluded from both halves and the response carries that second denominator separately, so the panel can say how many main decks it read rather than silently deflating every percentage.
- **Legend play-rate**: the same shape grouped by the deck's legend. The legend is the grouping axis throughout the archive (stats and the deck-browser filter); the champion is displayed on deck rows but is not an axis.

### Surfaces

Routes, all SSR public:

- **`/meta`**: the overview page. Stats panels (card inclusion table, top legends) plus the event list sorted by `event_date desc` (name, date, format, player count, organizer, deck count). Format and date-range filters drive both.
- **`/meta/$slug`**: single event page. Metadata header (name, date, format, player count, organizer, notes), the source citations, the contributor line, then its decks ordered by `finish_tier asc`, each with a finish/player/record badge.
- **`/meta/decks`**: cross-event deck browser using the decks-list filter pattern (URL-held filters, combobox controls, active-filter chips; the card-browser scaffold is card-cell machinery and does not fit deck tiles). Filters: format, date range, event multi-select, finish (winner / top 4 / top 8 / top 16 / any), legend. The whole archive is fetched once and filtered client-side.
- **`/meta/decks/$token`**: single archived deck. Reuses the public deck-share surface (the `/decks/share/$token` component) with the archive's facts (finish, player, record, event link, date) in the hero byline in place of an owner, and the fork CTA. Collection completion renders for logged-in users as on any shared deck.
- **`/meta/$slug/submit`**: signed-in decklist submission against an existing event. Deck-code paste or card-list text, player name, finish tier, record, an optional note. Proposing an event the archive does not have is the same form with the event fields shown.
- **`/settings`**: the credit visibility control (`hidden` / display name / Riot ID), with a preview of the line an event page would print.
- **`/meta/submissions`**: the submitter's own ledger, each entry with its status and, when the admin left one, the note explaining it.
- **`/admin/meta`**: admin-only event list with create/edit, plus a Candidates tab for the ingest pipeline below. Decks are created through a deck-code paste under the archive owner (with a small form for event, player name, finish tier, and record), or accepted from candidates. A linked candidate opens the two-tier review screen described under Review screen.

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
- **Linking and accept.** The link is `candidate_meta_events.meta_event_id` and `candidate_meta_decks.deck_id`, both many-to-one, set by an explicit admin action or by an accept that creates the live row. The live tables hold no provider key at all. An unlinked candidate accepts into a new event or deck in one step (deck creation reuses the admin create path: `decks` row under the archive owner, cards, satellite row). A linked candidate opens the per-field review screen, so corrections, late decklists, and a second provider's version of the same event all flow through the same queue. See Multi-source events and Review screen for the full model, which supersedes this ADR's original whole-entity accept.
- **Rejection.** `ignored_candidate_meta_events` keyed on `(provider, external_id)`, `ignored_candidate_meta_decks` on `(provider, event_external_id, external_id)`; ingest skips ignored keys so junk never resurfaces. The deck key names the source's event rather than the candidate row, so it survives that event's candidate being deleted and re-created.
- **Outcome ledger.** Provider uploads get none: those sources are the maintainer's own tooling, and staging's presence semantics suffice. User submissions get one, `meta_deck_submissions`, because a person who submits needs to see the outcome. See User submissions.

### Review screen

The original decision was whole-entity accept with a diff view, and it declined the card pipeline's per-field grid for a stated reason: that grid exists because many providers disagree per field, and the archive has one or two sources. With uvsgames and playriftbound disagreeing on the name and each holding what the other lacks, the reason no longer holds. The review screen becomes the printing screen, in two tiers.

**Event header.** `CandidateSpreadsheet` provides it: field rows by source columns, an editable Active column holding the live values, text diffs highlighted, an arrow per cell to take that source's value. Six editable rows (name, date, format, player count, organizer, notes) plus citations read-only. The endpoint is `acceptMetaEventField { field, candidateEventId }`, the analogue of `acceptPrintingField`.

The component is not reusable verbatim: its `candidateRows` prop is typed to the card pipeline's two response shapes. The coupling is shallow, though — it reads `id`, an optional `provider`, an optional parent id for submitter attribution, `checkedAt`, and otherwise indexes rows by field key — so it is made generic over a row constrained to those, rather than copied. A second spreadsheet would be two of every future fix.

**Deck roster.** One row per pilot, one column per source, each cell showing what that source holds (finish, record, list status, card count) beside the live deck. Per-row actions: link to a live deck, accept as a new deck, take this source's list. Expanding a row shows the list diff card by card, quantity and zone.

Card lists stay whole-entity. Per-card accept would write `deck_cards` row by row for a marginal gain over "take playriftbound's list, then edit it in the deck editor", so the grid governs scalars and `acceptMetaDeckList { candidateDeckId }` governs the list.

The single-source path must not get slower. An unlinked candidate still accepts wholesale in one click, creating the event and its decks exactly as before. The grid only appears once a second source is linked.

Whole-entity accept survives on a linked candidate as an explicit "take everything from this source", which is what a one-source event wants every week. It carries a guard: once a live event has more than one linked candidate, that action requires an explicit confirmation and refuses without it, naming the other sources. Without the guard the second provider silently reverts the first's curated name on every re-publish, which is the bug this amendment exists to prevent.

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
  -- source_url dropped 2026-08-18; attribution is meta_event_sources.
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

-- Candidate ingest (sketch). The live tables carry no provider key: the link
-- is the candidate-side FK below, many-to-one, so several sources fan into
-- one live event. See Multi-source events.

CREATE TABLE candidate_meta_events (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  provider       text NOT NULL,
  external_id    text NOT NULL,
  name           text NOT NULL,
  event_date     date NOT NULL,
  format         text NOT NULL,
  -- player_count / organizer / notes as on meta_events, nullable. source_url
  -- stays on the candidate: it is this provider's page for the event, and it
  -- becomes the meta_event_sources row's URL when the candidate is linked.
  meta_event_id  uuid REFERENCES meta_events(id) ON DELETE SET NULL,
  checked_at     timestamptz,
  extra_data     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE candidate_meta_decks (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  -- Exactly one of these two: a provider deck hangs off its candidate event,
  -- a user submission off the live event it targets.
  candidate_event_id  uuid REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
  meta_event_id       uuid REFERENCES meta_events(id) ON DELETE CASCADE,
  external_id         text NOT NULL,
  player_name         text NOT NULL,
  finish_tier         integer NOT NULL,
  record              text,
  name                text,
  cards               jsonb NOT NULL,  -- [{ name, zone, quantity, card_id | null }]
  list_status         text NOT NULL DEFAULT 'full'
                        CHECK (list_status IN ('full', 'partial', 'archetype')),
  deck_id             uuid REFERENCES decks(id) ON DELETE SET NULL,
  submitted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  submission_note     text,
  checked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(candidate_event_id, meta_event_id) = 1),
  UNIQUE (candidate_event_id, external_id)
);

-- meta_event_sources, meta_credits and the users.meta_credit_visibility column
-- are written out under Source citations and Contributor credit above.
-- meta_deck_submissions mirrors card_submissions (ADR-036) field for field,
-- with the target being a meta event and deck instead of a card.

-- ignored_candidate_meta_events: (provider, external_id, created_at).
-- ignored_candidate_meta_decks: (provider, event_external_id, external_id,
-- created_at). Both skip-at-ingest.
```

## Will Not Be Built

- **Unreviewed community entries.** Superseded in part 2026-08-18: signed-in users can submit, but nothing they send is public until an admin accepts it. There is still no moderation queue in the sense of user-visible content awaiting review, and no way for a non-admin to write the live tables.
- **In-app scraping or fetching.** The application never pulls from external sites: a citation URL is a back-reference, not a fetch target, and ingest is push-only (external tooling uploads candidate JSON; an admin accepts each entry). How sources produce their JSON is outside this system.
- **Player profiles.** Pilots stay free-text names: no claim flow, no "all decks by Player X" aggregation, no surfacing that a pilot has an OpenRift account. Contributor credit is a separate axis and does not change this: it names whoever entered the data, never who played the deck, and the two are rarely the same person.
- **Trade execution from an archived deck.** Collection integration only; the ADR-013 "trade sessions" stance applies unchanged.

## Deferred / Out of Scope

- **Promote-from-runner.** Publishing a completed ADR-033 tournament's submitted decks into the archive. Needs its own consent design.
- **Card-detail reverse link and the `card=$cardId` deck-browser chip.** The card page gets no archive section in MVP; both ship together as one fast-follow.
- **Archetype labels.** Legend + champion already imply the archetype to a reader.
- **Full standings beyond the entered top cut.**
- **Snapshot freezing, forked-from metadata, slug history/redirects.**
- **Deck-level source citation.** A deck page says who contributed it, not which site published the list. The event's citation list covers that until a deck page needs its own.
- **Contributor totals and a contributors page.** `meta_credits` makes "11 decks contributed" a `GROUP BY`, but nothing renders it yet.
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
- Accepting an unlinked candidate creates the live rows and links the candidate to them; a deck with an unresolved card name cannot be accepted.
- Linking a second provider's candidate to an existing event creates no second `meta_events` row, and after a re-upload both providers' candidates still resolve to the same live id.
- `acceptMetaEventField` writes exactly the named column and leaves every other field as it was.
- Linking writes that provider's `meta_event_sources` row; unlinking removes it and changes no field on the live event.
- A `candidate_meta_decks` row has exactly one of `candidate_event_id` / `meta_event_id`; both set or neither is rejected.
- Accepting a user-submitted deck writes one `meta_credits` row and resolves its ledger row to `accepted`; a rejected submission writes no credit.
- Every ledger status is reachable: declining a submission settles it to `rejected` / `not_applied` / `already_correct` with the admin's reason, and the submitter's own list shows that outcome rather than staying pending.
- A user contributing several decks to one event gets one `meta_credits` row per deck, and the unique index rejects a duplicate for the same deck.
- Deleting an account removes its `meta_credits` rows; deleting an archived deck removes the credit for that deck and leaves the contributor's other credits alone.
- Taking everything from one source refuses, naming the others, when the live event has more than one linked candidate and the caller did not confirm; with one linked candidate it still succeeds unprompted.
- A submission proposing an event writes a candidate event under `usersubmission` and a ledger row with a NULL target; a submission against an existing event writes neither.
- Match suggestions offer nothing outside the hard gates: an event three days out is offered, one four days out is not, and a deck whose pilot name does not overlap is never offered however its finish tier lines up.
- The upload endpoint requires an admin (API-key session included); non-admin keys get 403.

Read-path behaviour exercised by vitest tests:

- `/meta`, `/meta/$slug`, `/meta/decks`, and `/meta/decks/$token` all render for an unauthenticated request.
- The event page lists every `meta_event_sources` row, and its contributor line names each user once regardless of how many decks they added.
- A contributor on `hidden` is absent from the public payload entirely; switching to `name` or `riot_id` makes every past contribution appear, and an unset `riot_id` falls back to the display name.
- "My decks" excludes `meta-archive`-owned decks.
- Deck-browser filter combinations return the expected intersection (format, date range, event multi-select, finish tier, legend).
- Inclusion % and legend play-rate compute against a seeded fixture and match expected percentages.

## More Information

- **ADR-005 (collection tracking):** the completion overlay on the archived deck page is the same per-deck computation user decks use.
- **ADR-008 (supplemental card import):** the candidate ingest copies its pattern (source-agnostic candidate JSON, implicit providers, presence semantics, ignore tables) with per-event replace instead of provider-wide replace. As of 2026-08-18 it also copies the candidate-side link FK and the per-field compare grid, which this ADR originally declined.
- **ADR-036 (in-app user submissions):** supplies the whole user-submission design reused here, including the `usersubmission` provider, the submitter columns on the candidate, the outcome ledger shape, and the rate-limit and ban levers.
- **ADR-033 (unified tournaments):** owns the `tournaments` tables and `/tournaments` routes. This archive shares no data or UI with the runner.
- **ADR-035 (anonymous deck builder):** provides the logged-out "Open in deck builder" path via the existing client-side deck import.
- Original 2026-06-08 proposal: git history of this file (then `014-tournament-decks.md`).
