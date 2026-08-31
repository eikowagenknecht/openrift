---
status: accepted
date: 2026-08-29
---

# ADR-014: Meta Archive

> This is the second major revision (2026-08-29) of this ADR. The first (2026-08-14, amended 2026-08-18) designed a push-only archive: external tooling produced candidate JSON and an admin uploaded it by hand. This revision keeps the candidate/live split, the multi-source linking, the review screen, user submissions, and contributor credit, and changes five things. The old text survives in git history.
>
> - **In-app catalogue sync and fetching** replaces push-only ingest for the official source (uvsgames). The application maintains a slim mirror of the source's full event catalogue and fetches accepted events itself, on a schedule designed around the source API's real filters. The push endpoint survives for every other source.
> - **The standings pyramid** replaces the decks-only data model. The official source exposes the full player list with records for every event, the legend each player piloted for nearly every ran event, and full decklists only for the few events whose organizer publishes them. `meta_event_players` (one row per player) replaces `meta_decks` (one row per known deck), and a deck becomes an optional attachment to a player row. The `archetype` list status dissolves into "player row with a legend and no deck".
> - **Admin catalogue triage with auto-accept rules.** The admin browses the full catalogue and accepts events into the archive; accept triggers the deep fetch. Rule-gated auto-accept puts big official events live without a click, a scoped exception to "curated, never unreviewed".
> - **Structured results.** Exact ranks with a tier flag replace `finish_tier`, and win/loss/draw columns replace the free-text record.
> - **Pairings.** Every completed round's match list is fetched and stored as per-match facts: `candidate_meta_matches` staging, `meta_event_matches` live, keyed to the player rows. The event page gains a top-cut bracket over them.
> - **A second crawled source.** The official Chinese app (playloltcg) is mirrored and fetched the same way uvsgames is, on its own tables and its own crons, feeding the one candidate pipeline.

## Context and Problem Statement

Players researching the Riftbound meta currently hop over to riftdecks.com, which carries tournament results and their decklists. The lists there work, but they are decoupled from anything OpenRift knows about you: cards do not link to the catalog, there is no "do I own this?" overlay against your collection, and there is no way to fork a list into your own decks.

OpenRift has a complete decks subsystem (`decks` rows, `deck_cards`, formats, legend/champion zones, share tokens, deck codes, the deck builder) built around per-user ownership. We want a publicly browsable, admin-curated archive of competitive tournament results and their decklists, integrated with the catalog and collection.

The original decisions were how to model archived decks (separate world vs. reuse `decks`), where event metadata lives, and how several sources describing one tournament land on one event page.

The decision added in this revision is how the archive stays current. The push pipeline assumed a human runs external tooling and uploads the result, which means the archive is only as fresh as the maintainer's last session. The official source publishes continuously: its catalogue holds ~266k Riftbound events (growing by thousands per week), every event's player list and records are public, per-round standings record the legend each player piloted, and organizers flip decklists public on their own schedule, sometimes weeks after the event. The archive should pick all of that up on its own, without hammering the source: the API offers no changed-since queries, so naive freshness means re-crawling everything. It does offer start-date bounds and a handful of attribute filters, which the crawl windows and the official-event tracking are built on.

## Decision Drivers

- **Reuse, don't duplicate.** The existing `decks` schema, deck rendering, legend/champion logic, deck codes, and share-token routing are exactly what we'd build for archived decks anyway.
- **Catalog and collection integration is the value-add.** Every card links to its catalog page; the collection overlay computes missing copies for logged-in users without bespoke wiring.
- **Public + crawlable.** Archive pages are unauthenticated, SSR'd, and SEO-friendly.
- **Self-updating.** Results for a big event should appear within about an hour of it finishing, and late decklist publications should arrive without anyone noticing they were missing. Human time goes into curation calls, not into running fetch tooling.
- **Polite to the source.** The sync must not re-crawl what cannot have changed. Old completed events are visited once, ever. The steady-state budget is a few hundred requests per week, identified by an honest OpenRift User-Agent with a contact address, at single-request concurrency with backoff.
- **No PII.** Only the source's v2 endpoints are used; they expose public display names, records, and decklists, and no emails or real names.
- **Curated, with a rule-gated exception.** Everything reaches the archive through the candidate queue. A human accepts it, except official-source standings for events matching admin-controlled auto-accept rules, which go live unreviewed because they are the source's own published results and the admin can override any field afterwards.
- **The original stays in the DB.** Source data can be wrong, so every live field is overridable; the candidate row keeps the source's untouched version so drift between source and curation stays visible. No version history beyond that: current-source-vs-live is the comparison that matters.
- **One tournament, one page.** Sources disagree about names, hold different fields, and publish at different times. Reconciling them is the maintainer's job, and the tooling has to make it a few clicks.
- **Separate from the runner.** The ADR-033 runner (`tournaments`) holds real player-submitted decks; publishing those raises consent questions. The archive stays its own world.

## Considered Options

Data model (unchanged from the original proposal):

- **Reuse the `decks` shape with a synthetic owner + satellite tables.** Archived decks ARE rows in `decks`, owned by a single seeded system user, with satellite rows carrying event, standing, and player facts.
- **Separate snapshot tables.** A new immutable table pair independent of the user-deck schema.
- **Flag/extend `decks` with denormalised event columns.**

Keeping the archive current (new in this revision):

- **Push-only, run by hand.** The status quo. No new code, but freshness equals maintainer discipline, and late decklist publications are silently missed.
- **Push-only, run by a scheduled external worker.** Keeps the application source-agnostic, but the accept-triggers-fetch admin flow is impossible, and the worker is one more deployed thing with its own state.
- **In-app fetcher for the official source.** The application syncs the catalogue and fetches accepted events itself. The uvsgames client becomes part of the public codebase, and the "application never fetches" stance is dropped.

## Decision Outcome

We reuse the `decks` shape with a synthetic owner, model results as a per-player standings table with decks as optional attachments, and build the fetchers for the crawlable sources into the application: a slim in-DB catalogue mirror, scheduled windowed crawls, admin triage with auto-accept rules, and deep fetches that write ordinary candidate rows. All other sources keep pushing candidate JSON through the existing upload endpoint.

### Consequences

- Good, because the deck rendering, deck-code import, legend/champion detection, and collection completion overlay are inherited with zero new mechanisms.
- Good, because fork is the existing "duplicate deck" mutation, and the logged-out equivalent is the anonymous-builder import (ADR-035).
- Good, because the standings pyramid stores what the source actually has: every event gets full standings and a legend breakdown, not just the rare published decklists, which multiplies the events worth archiving.
- Good, because results of an accepted event land within about an hour of it finishing, and a decklist publication weeks later merges onto the already-live event with no human in the loop.
- Good, because old completed events are crawled once and never again; the steady-state request budget is a few hundred per week against a source that serves a global event locator.
- Good, because the candidate row doubles as the stored original: every live field is overridable and the compare grid shows source-vs-curation drift whenever the source changes.
- Bad, because archived decks aren't frozen: an admin editing a `decks` row retroactively changes "history." Accepted in exchange for code reuse.
- Bad, because `users.email` is NOT NULL, so the synthetic owner carries a placeholder address. It has no `accounts` row, so no credential or OAuth path can produce a session for it.
- Bad, because auto-accepted events go live with nobody having looked at them. Scoped to official-source standings under rules the admin toggles, and every field remains editable after the fact.
- Bad, because the uvsgames client lives in the public codebase and is coupled to an API that publishes no schema and can change shape without notice. The failure mode is a stalled sync surfaced in the admin UI, not corrupted data, since everything lands in candidates first.
- Bad, because a TO who publishes decklists more than the recheck horizon (~90 days) after their event is only caught by a manual full resync.
- Bad, because a second source still doesn't accept in one click: confirm-the-match, then pick fields, for every event two sources cover.

## Design Decisions

### Synthetic owner: `meta-archive`

A migration seeds one row in `users`: id `meta-archive` (`users.id` is text), a reserved placeholder email on a non-routable domain, `email_verified = false`, and no `accounts` row, so the auth system cannot produce a session for it. All archived decks have `decks.user_id = 'meta-archive'` and `is_public = true`.

The synthetic user is never rendered. Public surfaces show a player/event byline instead. Players are never linked to OpenRift accounts. Their source identity is normalized: a player fetched from the official source is stored as a `uvsgames_players` reference and rendered under that player's current display name, so a rename at the source propagates across the archive; players from every other source stay free-text names.

### `meta_events`

Events have their own page, slug, and permalink. Fields:

- `id uuid`: primary key, uuidv7.
- `slug text`: URL-safe, `[a-z0-9][a-z0-9-]{2,49}`, unique, mutable with no redirect (same policy as ADR-013 friend groups). Reserved-slug list: every name `/meta` spends on a static child, held in `RESERVED_META_EVENT_SLUGS` in the admin contract and shared by the ingest slug generator and the admin form. Auto-accepted events get a generated slug from name + date; the admin can rename it.
- `name text`: display name, 1–120 chars.
- `event_date date`: single date. Multi-day events store the start.
- `format text`: same vocabulary as `decks.format` so filters compose. The fetcher maps the source's format vocabulary; an event whose format doesn't map is never auto-accepted and waits in the queue.
- `player_count integer`: nullable; auto-filled from the source.
- `organizer text`: nullable, free text (e.g. "Riot Games", "LGS Berlin").
- `notes text`: nullable markdown, 4 000 char max, shown on the event page.
- `tier text`: NOT NULL, one of `premier` / `competitive` / `store` / `casual`, default `store`. How much the event counts for, taken from the source's event template where one is mapped and editable per event.
- `country text`: nullable, ISO 3166-1 alpha-2, parsed from the venue address.
- `location text`: nullable, 500 char max, the venue address as the source published it.
- `created_at`, `updated_at timestamptz`.

Intentionally omitted: multi-day representation, registration links, multiple formats per event.

### `meta_event_players`: the standings pyramid

The official source exposes three tiers of detail, and the model stores the pyramid instead of only its tip:

- **Players and records, every event.** The registrations endpoint is public for all events and carries each player's wins/losses/draws, match points, and final standing.
- **Legends, nearly every ran event.** Players almost never fill a decklist's legend section, but per-round standings record each player's `deck_defining_card`, verified to be the legend (present for 7,737 of 7,739 observed decks, never the champion).
- **Full decklists, rarely.** Readable only when the organizer flips `decklist_status` to PUBLISHED: currently ~67 of ~266k catalogued events.

One row per player per event, in `meta_event_players`:

- `id uuid`: primary key. Player rows have no natural key (names collide, ranks tie).
- `meta_event_id uuid`: NOT NULL, cascades from the event.
- `rank integer` + `rank_is_tier boolean`: exact final standing where known (`rank_is_tier = false`, displayed "8th"); tier-only sources set the flag (`rank 8`, displayed "T8"). Ties are legal, so `(meta_event_id, rank)` is indexed but not unique.
- `uvsgames_player_id integer` + `player_name text` (1–80 chars): exactly the player's identity, at least one required. A row filed from the official source stores the id with a null name and renders the `uvsgames_players` display name via coalesce, so a source rename propagates; a pushed or user-submitted row stores the name. An admin setting the local name wins the coalesce, which is the per-row override. `(meta_event_id, uvsgames_player_id)` is unique where the id is set.
- `wins`, `losses`, `draws smallint`: nullable, structured; display derives "5-1-0". Replaces the free-text `record`.
- `legend_card_id`, `champion_card_id uuid`: nullable FKs to `cards`. The legend lives here even when a deck exists, so every surface reads one column; the accept flow syncs it from the deck's legend zone when a list lands, from `deck_defining_card` otherwise.
- `deck_id uuid`: nullable UNIQUE FK to `decks`, ON DELETE RESTRICT. Deleting an archived deck must not silently delete a standings row; the admin path clears the reference and `list_status` first, then deletes the deck.
- `list_status text`: `none` / `partial` / `full`, with `CHECK ((deck_id IS NULL) = (list_status = 'none'))`. `partial` means the main deck is complete and side zones may be missing, so a partial list is still a list wherever the archive counts one. The old `archetype` status is gone: a legend-only entry is a player row with `list_status = 'none'`.

Only rows with a deck have a deck page. The public URL slug is `decks.share_token`, minted when the deck is created, which is exactly when a list becomes known; a player row without a deck has nothing to render and never appears in the sitemap. Rotating the share token is rejected while a `meta_event_players` row references the deck, so permalinks stay stable.

### Catalogue sync

A `uvsgames_events` table mirrors the source's full event listing as a slim projection: key, name, start time, estimated end, the source's status fields (`display_status`, `decklist_status`), player count, event format, configuration template id, store, location, and a content hash of the projection. The table is deliberately named for its source and carries no provider column: it is one API's shape, and the second crawlable source got its own mirror built around its own API rather than a premature generalization. Only the candidate layer is provider-keyed, because it genuinely takes multiple sources. All ~266k rows are stored (roughly 70–90 MB; the floor can't be recomputed for rows never stored), but never the raw listing row, which would be an order of magnitude more.

Entities the listing repeats on every row are normalized into source-keyed satellites, auto-discovered by the sync and never hand-seeded in code:

- `uvsgames_stores`: the source's integer store id and current name, upserted on every crawl (a store rename propagates). The store's contact email is never stored. `uvsgames_events.store_name` survives as a nullable fallback for rows the source publishes without a keyed store; reads resolve the coalesce.
- `uvsgames_players`: the source's integer user id and current display name, upserted on every deep fetch. See the standings section for how live rows use it.
- `uvsgames_event_templates`: the source's own template vocabulary, fetched from `/api/v2/event-configuration-templates/?game_slug=riftbound` on every crawl, plus a nameless row for any `event_configuration_template` the mirror carries that the endpoint no longer publishes. Nameless rows are routine rather than exceptional: the endpoint lists only the templates in use today, and the archive is full of events that ran superseded ones (four of them with thousands of events each). Their names are unrecoverable, so those rows are recognized by the events under them. `source_name` is the source's; `watched` and `tier` are the admin's, and they are the only things a human supplies. A watched template drives the catalogue badge, the targeted poll query, and the official auto-accept rule, and its `tier` is what the events under it are filed as. No template id appears in source code; the Regional Qualifier template is seeded as watched by migration and named by the first sync.
- `uvsgames_format_mappings`: discovered source format strings mapped to `deck_formats` slugs by the admin; absence of a row means unmapped, and unmapped events wait for a human. No format vocabulary in code.

Observations about the listing stay on the mirror row (`first_seen_at`, `last_seen_at`, `missing_since`): the source deletes events, and a row a covering crawl no longer returns is flagged, not removed. The recheck queue is scheduler state, not source data, so it lives in its own table, `uvsgames_event_checks` (`next_check_at`, `check_stage`), with rows existing exactly for accepted events; an exhausted ladder keeps its row with a null next visit, preserving the "was accepted and ran the ladder" fact.

Two endpoints are read. The listing, `/api/v2/events/`, offers DRF page-number pagination (250 per page, a hard cap) and no changed-since queries, so freshness still means re-reading windows. The template vocabulary, `/api/v2/event-configuration-templates/`, is anonymous like the listing but answers with a bare array of a couple of dozen entries and no page envelope; its `game_slug` parameter is required and only the lowercase slug is accepted (`RIFTBOUND` and the numeric game id are both 400). One request refreshes every template name there is, which is why no template is named by hand. Confirmed filters, verified against the live API (unknown parameters are silently ignored, so every filter claim here was tested by comparing result counts): `start_date_after` / `start_date_before`, `display_statuses` (repeatable), `name` substring, `is_headlining_event`, `event_configuration_template_ids` (repeatable, singular variant `event_configuration_template_id`), `gameplay_format_ids` (repeatable), and `store_ids`. Verified to do nothing: `ordering` in any form, `event_type`, and the bare singular `event_configuration_template`. `display_status` filters for the values `complete`, `upcoming` and `inProgress`; any other value falls through to no filter at all rather than to an empty result, which makes a typo look like a working crawl over the whole listing.

**Crawls walk date ranges, not page numbers.** Both date bounds are inclusive and millisecond-precise, so a range whose `count` fits in one page returns all of it in a single request. A range that does not fit is split by time and re-asked; a range the source refuses is halved until the failure is cornered. Nothing walks an offset except inside a single instant that holds more than 250 events, which is rare and reported when it happens.

Two source behaviours force this, and neither is visible from a single request:

- **The listing has no stable sort.** It orders by start time ascending, but events tie on that time in their hundreds and the tie order shuffles between requests. Deep offset paging therefore returns the same event two or three times and silently drops others. Range splitting is immune: correctness stops depending on order the moment a range fits one page.
- **Individual rows are unserializable.** Some rows answer HTTP 500 at every page size and on every retry, taking down whichever page they land in and nothing else. There is exactly one in the archive today, at offset 91 593 (an unremarkable completed local event starting `2026-04-06T13:00:00Z`, whose id is unobtainable because every query that would return it fails). The first implementation stopped the whole crawl at the first refused page, which is how a backfill read 91 500 of 267 000 events and reported success. Halving the range corners the bad row on its own instant, and walking that instant a row at a time keeps its neighbours: the loss is one event, not a page of 250.

Two listing fields need care. `event_format` is `OTHER` or empty on effectively every row; the usable format vocabulary (Constructed, Sealed, Draft, ...) is `gameplay_format.name`, which the projection prefers. `event_configuration_template` identifies the exact official tournament structure an event runs: the Regional Qualifier template id selects precisely the official RQs, where the notable-name vocabulary also matches store-run events that merely borrow the name.

The schedule, all at single concurrency with backoff and jitter:

- **Hourly targeted poll** (a handful of requests): one query per watched official template id over `[now − 7d, now + 30d]`, plus `display_status=inProgress` over `[now − 2d, now + 30d]`. These keep every event anyone is waiting on fresh. Both queries are date-bounded on purpose: unbounded, the poll would re-read a busy template's oldest events every hour and never reach today's, because the listing starts at the beginning of the archive. Everything outside this reach belongs to the window crawl.
- **Weekly recent-past window crawl**, `[now − 45d, now]` (~450 requests): where everything that matters happens: events complete, standings finalize, decklists publish. Every event eventually crosses "now" and sits in this window for 45 days, so nothing that runs is ever missed even if the future is never crawled. Only a run that covered the whole window may flag rows missing, since a gap in coverage is indistinguishable from a row the source dropped.
- **Biweekly future-tail crawl**, `[now, now + 2y]` (~350 requests): early visibility of scheduled events for the admin UI. A nice-to-have, not correctness.
- **Event-day escalation**: once the clock passes an accepted event's start time, its listing is polled hourly until `display_status` flips to `complete`, then the deep fetch runs. Standings for a Regional Qualifier land within about an hour of the finals.
- **Decaying per-event rechecks** for accepted events (+1d, +3d, +7d, +30d, +90d after completion, one request each): catches late decklist publication, the one change class the windows age out of.
- **Manual full resync** from the admin UI, for truing up the long tail whenever the maintainer feels like it. Nothing scheduled ever re-crawls old completed events; the initial backfill visits them once. It covers the archive's whole span in one walk, which is roughly 1 500 to 2 500 requests and one to two hours at the crawl's pacing, so it checkpoints: a run that stops early records how far it got and the next one continues from there. It can also be stopped from the admin panel, and restarted from the first day when the mirror is wrong rather than merely incomplete.

Every crawl reports its own coverage rather than only its counters: a run that skipped a range, ran out of request budget, or was cancelled is marked incomplete and names what it could not read. A crawl that stops early otherwise looks exactly like a healthy one, which is the failure that hid the stalled backfill.

Steady state is roughly 800–1 000 requests per week. Every sync run goes through the existing `runJob` machinery and lands in `job_runs` under `meta.*` kinds (catalogue poll, window, future tail, backfill, per-event fetch, resync), which brings orphan sweeping, Sentry capture, the retention cleanup, and the admin status surface for free; no bespoke run table. Crons register from `config.cron` schedules like every other job, so an environment without the schedules set (local dev) never fetches, and the admin UI's manual triggers are the way to exercise the sync there.

### The playloltcg source

A second source is crawled: the official Chinese app, playloltcg. It gets its own mirror rather than a generalization of the first, because its ids, its listing and its lifecycle vocabulary are its own. Only the candidate layer is shared.

Three tables hold it, shaped after the uvsgames trio:

- `playloltcg_shops`: the store registry (`shop/searchShop`, ~1 515 rows in one call). It carries structured geography (province, city, area, address, coordinates) and the only stable store id the source publishes.
- `playloltcg_events`: the listing mirror, keyed on the source's `activityShopId`. Discovery is a global date-window query (`activityShop/page` over a start/end range with an empty user location returns every event nationwide), so the crawl walks date ranges exactly as the uvsgames one does. The venue lives on the event, not on the shop: the listing repeats the address per row, and an event can run away from the store. The listing never links its shop, so `shop_id` stays null until the deep fetch reads the exact `shopInfoResponse.id` off the event detail, with `shop_name` as the display fallback until then. `status` is the source's `sortWeight` lifecycle (1 registration-open through 5 finished), which the recheck ladder reads the way it reads `display_status`.
- `playloltcg_event_checks`: the recheck queue, one row per accepted event, split from the mirror for the same reason `uvsgames_event_checks` is.

There is no template rule and no notable-name rule here. The source's `activityType` is a blunt bucket, spanning city qualifiers down to casual nights, so the registered player count is the only auto-accept signal and everything else waits for a human. Events are filed as constructed.

Both sources write ordinary `candidate_meta_events` and `candidate_meta_players` rows under their own provider string, so review, linking, citations, per-field accept and the ignore tables are one pipeline with two producers. Scheduling stays per-source: `CRON_META_PLAYLOLTCG_SYNC` and `CRON_META_PLAYLOLTCG_RECHECK` sit beside the uvsgames pair, all four unset by default, and `META_PLAYLOLTCG_BASE_URL` aims the client at the source the way `META_SYNC_BASE_URL` does for uvsgames, so a test deployment can point either at a recorded fixture server.

### Admin catalogue triage and auto-accept

The admin UI presents the catalogue as a filterable list (status, player-count floor, decklists published, name, date) with two actions per row:

- **Accept** creates the live `meta_events` row, writes the provider's `candidate_meta_events` row linked to it, and queues the deep fetch. When the fetch lands, official standings and legends flow through the candidate straight onto live player rows.
- **Dismiss** writes the existing ignore table, so the row drops out of the "new" filter and ingest skips it forever.

Triage state is derived, never stored on the catalogue row: "new" means no candidate links the key and it isn't ignored.

**Auto-accept rules** run at sync time against catalogue changes: an event running a watched template from `uvsgames_event_templates`, a player count at or above a threshold, or a name matching the notable vocabulary. Each rule is an admin-controlled toggle, and all of them sit behind the format mapping, so an event whose source format maps to no `deck_formats` slug is never accepted automatically. The template rule is checked first: the organizer picked that template and an admin decided it was worth watching, where a name is free text. A matching event is accepted exactly as if clicked, including the straight-to-live standings. This is the deliberate exception to "curated, never unreviewed", scoped to the official provider's own published results; decklists whose card names don't all resolve, format mappings that fail, cross-source merges, and every non-official source still wait for a human. Auto-accept never fires for an event already dismissed.

### Deep fetch

Per accepted event, the fetcher pulls the event detail, the registrations (players, records, final standings, deck references), the final overall standings, the final completed round's per-round standings (for `deck_defining_card`), and every completed round's match list, roughly five requests plus one per round. Individual decklists are fetched, one request each, only when the listing says `decklist_status` is PUBLISHED. A round's matches are locked once it completes, so each round is fetched once, ever: rounds already staged are skipped on later visits, the same accumulate-and-never-retry contract decklists follow.

The fetch writes one `candidate_meta_events` row, its `candidate_meta_players` rows, and its `candidate_meta_matches` rows, exactly the shape the push endpoint produces for events and players, so everything downstream (review, linking, per-field accept, diffs) is shared. The latest raw fetch payload is kept as a jsonb column on the candidate event, overwritten on every fetch: enough to re-run the transform after a mapping fix without touching the source, with no version history (current-source-vs-live is the comparison that matters, and the candidate row provides it). Matches are deliberately absent from that payload; the Pairings section says why.

### Pairings

The source publishes every completed round's match list through the same v2 surface the rest of the fetch uses (`/api/v2/tournament-rounds/{id}/matches/paginated/`; participants are user ids and public handles, no PII). One match is a handful of integers and flags: table number, bye and draw markers, games won, the winner. That shape decides the storage: matches are parsed on arrival into `candidate_meta_matches` rows and never kept in the candidate's raw payload. The raw tier exists so a lossy transform (card-name matching) can be re-run locally after a mapping fix; a match transform has nothing to re-run, and a projection bug means re-fetching the affected rounds from a stable, cheap endpoint. Keeping a second copy in jsonb would roughly double a big event's raw column for no read path.

Staged matches reference `uvsgames_players` directly. Participants are ordered deterministically (by user id), which makes `(candidate_event_id, round_id, player1_uvsgames_id)` the natural key without trusting an undocumented source match id: one row per round per first-seat player, and a bye keeps its single player in that seat. A re-fetch replaces per round in one transaction, so a mid-event capture is corrected by the next visit and never duplicated.

The live table `meta_event_matches` hangs off `meta_event_players`, not the source layer, so a hypothetical second pairings source would land the same way standings do. Materialization runs after the player accept: a staged match goes live only when every participant has a live player row (resolved through the candidate players' uvs ids), and the live id is stamped back as `meta_event_match_id`. Unstamped rows are the retry queue; a later ladder visit materializes them without refetching once their players are accepted. Deleting a live player cascades away its live matches while the staged rows survive unstamped, so re-accepting the player restores the matches from staging.

Pairings are published as per-match facts: the event page's top-cut bracket reads the stored matches directly. Events whose top cut was not played keep their matches archived with nothing rendering them.

### Multi-source events

Two sources describing the same tournament have to land on one live event. The live tables carry no provider key at all; `candidate_meta_events.meta_event_id` and `candidate_meta_players.meta_event_player_id` are nullable N:1 FKs (the printings model from ADR-008), so several sources fan into one live event and an admin assigns the links.

- A re-upload or re-fetch finds its live target through its own candidate row, keyed `(provider, external_id)`, which survives every update.
- Three admin actions at each level, named after the card pipeline's: **link** (point an unlinked candidate at an existing live row), **relink**, **unlink**.
- Linking is separate from accepting: a source whose values were rejected still contributed, and its citation does not depend on taking any of its fields.
- A candidate player may only link to a player row inside its own event's linked event.

**Match suggestions.** Ingest proposes and the admin confirms; suggestions are ranked hints, never applied automatically. Hard gates before scoring: an event is only a candidate match when its `format` matches and its `event_date` is within three days (a multi-day event gets filed under different days by different sources), and a player only when the normalized `player_name` overlaps.

### Source citations

Attribution is a list, `meta_event_sources`, because two sources means two credits on one page:

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

A provider row is written when its candidate is linked and removed when it is unlinked. A hand-entered row carries no provider key. Citations answer "where did this data come from" and are public; they never carry a user. Deck-level citation is deferred.

### Card lists, formats, legends

Card lists live in `deck_cards` unchanged: no second card-list schema, no snapshot copy. Format is `decks.format`. A deck's legend and champion come from the existing legend/champion zones (`packages/shared/src/deck-rules.ts` vocabulary) and are synced onto the player row at accept. The collection overlay sums copies across all printings of the underlying card.

### Relationship to the runner

None. No foreign keys between the archive tables and the runner's `tournaments` tables, no promote flow, no shared UI. Publishing a completed runner tournament's decks into the archive would be a new ADR with its own consent design.

### Visibility and ownership rules

- Read endpoints (overview, event page, deck browser, deck page) are unauthenticated.
- Write endpoints (create/edit/delete events, players, and archived decks; catalogue triage; sync controls) require the `admin` role. The server checks both the role and the synthetic owner.
- "My decks" reads apply `excludeMetaArchive()` so the archive never appears in a user's own list.

### Fork: pure copy, no back-link

- **Logged in:** "Fork to my decks" duplicates the deck for the requester (`is_public = false`, `share_token = NULL`, `deck_cards` copied, no archive rows) and opens it in the deck builder.
- **Logged out:** "Open in deck builder" creates a local anonymous deck (ADR-035) from the card list, client-side.

No `forked_from` metadata in either path.

### User submissions

A signed-in user can submit a decklist for an event the archive already has, or propose an event it does not. This is ADR-036's design applied to a second entity: the submission writes a candidate under the reserved `usersubmission` provider, everything downstream is the shared review queue, and rejections go to the shared ignore table.

- **Target.** A submission is a decklist for a player, so a candidate player row must be able to hang off a live event directly: `candidate_meta_players` requires exactly one of `candidate_event_id` / `meta_event_id`, and a submission against an existing event takes the `meta_event_id` branch.
- **Proposing an event** writes a real `candidate_meta_events` row under the same provider and hangs its player off that; an admin accepts or ignores it through the same actions.
- **Attribution on the candidate.** `submitted_by_user_id` and `submission_note`, both nullable, both admin-facing.
- **Ledger.** `meta_submissions` (renamed from `meta_deck_submissions`), shaped like `card_submissions`: user, target, status, resolution reason and note, resolver, timestamps. Accepting the candidate settles its row to `accepted`; declining needs an explicit admin resolution (`rejected`, `not_applied`, `already_correct`) with an optional note, so nothing reads as pending forever.
- **Anti-spam.** Per-user rate limiting, the admin ban lever, and nothing being public before an accept.

### Contributor credit

Credit is opt-in and public. One row per contribution, written as part of the accept it belongs to, and never for provider ingest or hand entry:

```sql
CREATE TABLE meta_credits (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id         uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  meta_event_player_id  uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,  -- NULL: the event itself
  user_id               text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_meta_credits_contribution
  ON meta_credits (meta_event_id, user_id, meta_event_player_id) NULLS NOT DISTINCT;
```

The row stores the user id and nothing else; the name resolves at render, so renames, profile changes, and account deletion follow automatically. Consent is a profile setting:

```sql
ALTER TABLE users ADD COLUMN meta_credit_visibility text NOT NULL DEFAULT 'hidden'
  CHECK (meta_credit_visibility IN ('hidden', 'name', 'riot_id'));
```

Rows are always written; the public read joins `users` and drops anyone still on `hidden`. `riot_id` chosen but unset falls back to `name`; `name` unset omits that contributor. The event page prints "Contributed by A, B and 2 others" under the source citations; a deck page prints its own contributor. Plain text, no profile links.

### What the archive publishes

Every public row and number is a fact one tournament published, or a count of what the archive holds: standings (rank, player, record, legend), per-match pairings, decklists, event metadata, and source citations.

The archive counts are live-queried until pressure shows up, scoped by format and date range: **tournament entries archived** (`meta_event_players` rows in scope) and **how many of those carry a decklist** (`list_status` in `partial`, `full`). Both caption the archive's own lists. A legend page counts that legend's archived finishes and decklists the same way, to caption its record.

### Surfaces

Routes, all SSR public:

- **`/meta`**: the archive's front page. The archive counts, the latest winners, the most recent events, the newest decklists, a search box, and the contribute band.
- **`/meta/events`**: the tournament index. One row per event: date, name, venue, tier, country, format, players, decklist count, and the winner inline.
- **`/meta/$slug`**: single event page. Metadata header, source citations, contributor line, the podium, the decks with known lists ordered by rank, the full standings table (rank, player, record, legend), and the top-cut bracket with each round's match results.
- **`/meta/decks`**: cross-event deck browser using the decks-list filter pattern. Filters: format, date range, event, finish (winner / top 4 / top 8 / top 16 / any), legend, tier, country. Opens on the best finish per legend per event, with the full list one click away, and overlays a signed-in reader's collection.
- **`/meta/decks/$token`**: single archived deck, reusing the public deck-share surface with the archive's byline (rank, player, record, event link, date), the ownership line, and the fork and deck-code actions.
- **`/meta/legends`**: alphabetical index of every legend the archive holds a result for, with the number of lists on file.
- **`/meta/legends/$slug`**: one legend's record: its archived finishes, the players behind them, and the lists they registered.
- **`/meta/$slug/submit`**: signed-in decklist submission against an existing event; proposing a new event is the same form with the event fields shown.
- **`/settings`**: the credit visibility control, with a preview of the printed line.
- **`/meta/submissions`**: the submitter's own ledger.
- **`/admin/meta`**: event list with create/edit, the Candidates review tab, and two additions: a **Catalogue** tab (the triage list above, with the auto-accept rule toggles and the manual full-resync action) and a **Sync** panel showing recent `meta.*` job runs and any stalled state.

A scope bar (era, format, tier, country) is shared by every archive page and encoded in the URL. Every name `/meta` spends on a static child is a reserved event slug, so no event can be shadowed by one.

The byline for an archived deck everywhere is player + rank + event, never an account owner. Navigation: a "Meta" entry in the main header, shown only while the flag is on.

### Candidate ingest

Two producers write the same candidate tables:

- **The in-app fetchers** (uvsgames, playloltcg): catalogue sync, accept, deep fetch, as above.
- **The push endpoint** (everything else): `POST /api/admin/v1/meta/upload` with `{ provider, events: [...] }`, admin API key auth. Per-event replace: each uploaded event wholly replaces its own candidate; events absent from the payload are untouched; uploads are idempotent.

Shared staging semantics:

- Events are keyed `(provider, external_id)`; player external ids are scoped to their event. Providers are implicit: a new string is a new provider.
- Card lists are jsonb on the candidate player (`{ name, zone, quantity, cardId }` — the stored keys are camelCase), NULL for standings-only rows. `checked_at` marks "an admin reviewed this" and resets whenever an update changes the row, so changed events re-enter the queue. Unchanged updates reset nothing, so automated re-pushes and re-fetches are harmless.
- **Card matching.** Payloads carry card and legend _names_; ingest resolves them through the same normalized-name + `card_name_aliases` matching the card pipeline uses. A deck cannot be accepted until every card resolves; a player row can, since its legend resolves independently.
- **Rejection.** `ignored_candidate_meta_events` keyed `(provider, external_id)`, `ignored_candidate_meta_players` keyed `(provider, event_external_id, external_id)`; ingest and sync skip ignored keys. An ignore **marks the key and leaves the candidate row in place**, live link included; the prior implementation deleted the row, which meant ignore, un-ignore, re-upload staged the same player's deck as new and accepting it archived a duplicate (the bug `meta_deck_sources` was added to fix). With the row surviving, the candidate link stays the only source key and that table goes away.
- **Outcome ledger.** Provider ingest gets none; user submissions get `meta_submissions`.

### Review screen

The review screen is the card pipeline's, in two tiers.

**Event header.** `CandidateSpreadsheet`, made generic over its row type: field rows by source columns, an editable Active column holding the live values, diffs highlighted, an arrow per cell to take a source's value. The endpoint is `acceptMetaEventField { field, candidateEventId }`.

**Player roster.** One row per player, one column per source, each cell showing what that source holds (rank, record, legend, list status, card count) beside the live row. Per-row actions: link to a live player, accept as new, take this source's list. Expanding a row shows the list diff card by card.

Card lists stay whole-entity: the grid governs scalars and `acceptMetaDeckList { candidatePlayerId }` governs the list.

The single-source path must not get slower: an unlinked candidate accepts wholesale in one click. Whole-entity accept survives on a linked candidate as "take everything from this source", guarded once a live event has more than one linked candidate, so a re-publish never silently reverts another source's curated values.

### Launch

Ships behind the `meta` feature flag. Backfill the catalogue, seed real events behind the flag, then flip it on. No changelog entry until launch.

## Schema sketch

```sql
-- Seed via migration; no accounts row exists, so auth cannot produce a session.
-- INSERT INTO users (id, email, name) VALUES ('meta-archive', '<placeholder>', 'Meta Archive');

-- Source layer: the uvsgames mirror and its normalized satellites. Deliberately
-- source-named and provider-free; a second crawlable source would get its own
-- mirror shaped around its own API.
CREATE TABLE uvsgames_events (
  external_id     text PRIMARY KEY,
  name            text NOT NULL,
  start_at        timestamptz NOT NULL,
  end_at_estimate timestamptz,
  display_status  text NOT NULL,            -- source vocab: upcoming | inProgress | complete
  decklist_status text,                     -- source vocab; PUBLISHED unlocks deck fetches
  player_count    integer,
  event_type      text,
  event_format    text,                     -- gameplay_format.name (the listing's own
                                            -- event_format is OTHER or empty everywhere)
  event_configuration_template text,        -- official-structure id; see the templates table
  store_id        integer REFERENCES uvsgames_stores(id),
  store_name      text,                     -- fallback for rows without a keyed store
  location        text,
  timezone        text,                     -- venue IANA zone; event_date is the venue-local
                                            -- day of start_at, not the UTC day
  content_hash    text NOT NULL,            -- hash of this projection; change detection
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL,
  missing_since   timestamptz               -- a covering crawl no longer returned the row
);

-- Auto-discovered satellites, admin-curated where curation exists. No source
-- id or vocabulary is compiled into the application.
CREATE TABLE uvsgames_stores (
  id   integer PRIMARY KEY,                 -- the source's store id; name tracks renames
  name text NOT NULL
);
CREATE TABLE uvsgames_players (
  id           integer PRIMARY KEY,         -- the source's global user id
  display_name text NOT NULL                -- current best_identifier; renames propagate
);
CREATE TABLE uvsgames_event_templates (
  template_id text PRIMARY KEY,
  source_name text,                         -- the source's own name, refreshed each sync;
                                            -- null once the endpoint stops publishing it
  watched     boolean NOT NULL DEFAULT false,
  tier        text                          -- what events under it are filed as; NULL
    CHECK (tier IS NULL OR                  -- until an admin maps the template
           tier IN ('premier','competitive','store','casual'))
);                                          -- watched and tier are the admin-owned columns
CREATE TABLE uvsgames_format_mappings (
  source_format text PRIMARY KEY,
  mapped_format text NOT NULL REFERENCES deck_formats(slug)
);                                          -- no row = unmapped, waits for a human

-- Scheduler state, split from the mirror: rows exist exactly for accepted
-- events; an exhausted ladder keeps its row with next_check_at NULL.
CREATE TABLE uvsgames_event_checks (
  external_id   text PRIMARY KEY REFERENCES uvsgames_events(external_id),
  next_check_at timestamptz,
  check_stage   smallint NOT NULL DEFAULT 0
);

-- The second source's mirror, on the same three shapes and sharing nothing but
-- the candidate layer. Geography is structured here because the source
-- publishes it that way.
CREATE TABLE playloltcg_shops (
  id       integer PRIMARY KEY,             -- the source's shop id, from the registry
  name     text NOT NULL,
  province text, city text, area text, address text,
  longitude double precision, latitude double precision
);
CREATE TABLE playloltcg_events (
  activity_shop_id bigint PRIMARY KEY,      -- the source's own event key
  shop_id          integer REFERENCES playloltcg_shops(id),  -- null until deep-fetched
  shop_name        text,                    -- fallback until shop_id is known
  name             text NOT NULL,
  activity_type    text, activity_type_name text,  -- too blunt to be an accept signal
  battle_mode      text,                    -- 1v1 | 2v2 | 3v3 | multi
  status           smallint,                -- sortWeight lifecycle, 1 open .. 5 finished
  start_at         date, end_at date,       -- the source publishes day granularity only
  player_count     integer, max_user integer, fee integer,
  province text, city text, area text, address text,
  longitude double precision, latitude double precision,
  content_hash     text NOT NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL,
  missing_since    timestamptz
);
CREATE TABLE playloltcg_event_checks (
  activity_shop_id bigint PRIMARY KEY REFERENCES playloltcg_events(activity_shop_id),
  next_check_at    timestamptz,
  check_stage      smallint NOT NULL DEFAULT 0
);

-- Sync runs are recorded in the existing job_runs table via runJob, under
-- meta.* kinds. No bespoke run table.

-- Auto-accept rules and the sync switches are one singleton row, admin-edited.
CREATE TABLE meta_sync_settings (
  id                      integer PRIMARY KEY CHECK (id = 1),
  auto_accept_min_players integer,                 -- NULL = rule off
  auto_accept_notable     boolean NOT NULL DEFAULT false,
  auto_accept_official    boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Live layer.
CREATE TABLE meta_events (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  slug          text NOT NULL UNIQUE
                  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  event_date    date NOT NULL,
  format        text NOT NULL,
  player_count  integer CHECK (player_count IS NULL OR player_count > 0),
  organizer     text CHECK (organizer IS NULL OR length(organizer) BETWEEN 1 AND 120),
  notes         text CHECK (notes IS NULL OR length(notes) <= 4000),
  tier          text NOT NULL DEFAULT 'store'
                  CHECK (tier IN ('premier','competitive','store','casual')),
  country       text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  location      text CHECK (location IS NULL OR length(location) BETWEEN 1 AND 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meta_events_event_date ON meta_events (event_date DESC);
CREATE INDEX idx_meta_events_format     ON meta_events (format);

CREATE TABLE meta_event_players (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id    uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  rank             integer NOT NULL CHECK (rank >= 1),
  rank_is_tier     boolean NOT NULL DEFAULT false,
  uvsgames_player_id integer REFERENCES uvsgames_players(id),
  player_name      text CHECK (player_name IS NULL OR length(player_name) BETWEEN 1 AND 80),
  -- At least one identity; display resolves coalesce(player_name, display_name),
  -- so a local name doubles as the admin override. Unique per event where set:
  -- UNIQUE (meta_event_id, uvsgames_player_id) WHERE uvsgames_player_id IS NOT NULL.
  CHECK (player_name IS NOT NULL OR uvsgames_player_id IS NOT NULL),
  wins             smallint,
  losses           smallint,
  draws            smallint,
  legend_card_id   uuid REFERENCES cards(id),
  champion_card_id uuid REFERENCES cards(id),
  deck_id          uuid UNIQUE REFERENCES decks(id) ON DELETE RESTRICT,
  list_status      text NOT NULL DEFAULT 'none'
                     CHECK (list_status IN ('none','partial','full')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((deck_id IS NULL) = (list_status = 'none'))
);

CREATE TABLE meta_event_matches (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id  uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  phase_order    integer NOT NULL DEFAULT 0,
  round_number   integer NOT NULL CHECK (round_number >= 1),
  table_number   integer,               -- null on byes (the source sends -1)
  is_bye         boolean NOT NULL DEFAULT false,
  is_draw        boolean NOT NULL DEFAULT false,
  player1_id     uuid NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
  player2_id     uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
  winner_id      uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
  games_won_p1   smallint,
  games_won_p2   smallint,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((player2_id IS NULL) = is_bye),
  CHECK (winner_id IS NULL OR winner_id = player1_id OR winner_id = player2_id),
  UNIQUE (meta_event_id, phase_order, round_number, player1_id)
);
CREATE INDEX idx_meta_players_event  ON meta_event_players (meta_event_id, rank);
CREATE INDEX idx_meta_players_legend ON meta_event_players (legend_card_id);

-- Candidate layer: the stored originals. The live tables carry no provider key;
-- the link is the candidate-side FK, many-to-one, so several sources fan into
-- one live event.
CREATE TABLE candidate_meta_events (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  provider       text NOT NULL,
  external_id    text NOT NULL,
  name           text NOT NULL,
  event_date     date NOT NULL,
  format         text NOT NULL,
  player_count   integer,
  organizer      text,
  notes          text,
  source_url     text,                 -- becomes the citation row's URL on link
  meta_event_id  uuid REFERENCES meta_events(id) ON DELETE SET NULL,
  raw            jsonb,                -- latest deep-fetch payload, overwritten each
                                       -- fetch; enables re-transform without refetch
  extra_data     jsonb,
  fetched_at     timestamptz,          -- NULL for push providers
  checked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE candidate_meta_players (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  -- Exactly one: a provider row hangs off its candidate event, a user
  -- submission off the live event it targets.
  candidate_event_id   uuid REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
  meta_event_id        uuid REFERENCES meta_events(id) ON DELETE CASCADE,
  external_id          text NOT NULL,
  player_name          text NOT NULL,  -- the staged original keeps the name;
  uvsgames_player_id   integer,        -- set only for official-source rows
  rank                 integer NOT NULL,
  rank_is_tier         boolean NOT NULL DEFAULT false,
  wins                 smallint,
  losses               smallint,
  draws                smallint,
  legend_name          text,
  legend_card_id       uuid REFERENCES cards(id),
  champion_name        text,
  champion_card_id     uuid REFERENCES cards(id),
  cards                jsonb,          -- [{ name, zone, quantity, cardId }] | NULL
  list_status          text NOT NULL DEFAULT 'none'
                         CHECK (list_status IN ('none','partial','full')),
  meta_event_player_id uuid REFERENCES meta_event_players(id) ON DELETE SET NULL,
  submitted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  submission_note      text,
  checked_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(candidate_event_id, meta_event_id) = 1),
  UNIQUE (candidate_event_id, external_id)
);

-- Pairings staging. Deep-fetch only (no push or user-submission producer), so
-- the event FK is NOT NULL, unlike candidate_meta_players. Participants are
-- ordered deterministically (by user id), which makes the per-round key below
-- deterministic: one row per round per first-seat player.
CREATE TABLE candidate_meta_matches (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  candidate_event_id   uuid NOT NULL REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
  round_id             text NOT NULL,   -- the source's round key; held rounds are never refetched
  phase_order          integer NOT NULL DEFAULT 0,
  round_number         integer NOT NULL CHECK (round_number >= 1),
  table_number         integer,
  is_bye               boolean NOT NULL DEFAULT false,
  is_draw              boolean NOT NULL DEFAULT false,
  player1_uvsgames_id  integer NOT NULL REFERENCES uvsgames_players(id),
  player2_uvsgames_id  integer REFERENCES uvsgames_players(id),
  winner_uvsgames_id   integer REFERENCES uvsgames_players(id),
  games_won_p1         smallint,
  games_won_p2         smallint,
  meta_event_match_id  uuid REFERENCES meta_event_matches(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((player2_uvsgames_id IS NULL) = is_bye),
  CHECK (winner_uvsgames_id IS NULL
         OR winner_uvsgames_id = player1_uvsgames_id
         OR winner_uvsgames_id = player2_uvsgames_id),
  UNIQUE (candidate_event_id, round_id, player1_uvsgames_id)
);

-- meta_event_sources, meta_credits and users.meta_credit_visibility are written
-- out in their sections above. meta_submissions mirrors card_submissions
-- (ADR-036) with the target being a candidate/live player row.
-- ignored_candidate_meta_events: (provider, external_id, created_at).
-- ignored_candidate_meta_players: (provider, event_external_id, external_id,
-- created_at). Both skip-at-ingest.
```

Both jsonb columns (`raw`, `cards`) follow the repo's jsonb rules: parsed-shape write types in `db/tables.ts` and `jsonb_typeof` CHECK constraints.

Superseded: `meta_deck_sources` (migration 256, the per-deck source keys). Its job was surviving the old delete-on-ignore semantics; with ignores keeping candidate rows, `candidate_meta_players.external_id` plus the candidate link carries that information.

## Will Not Be Built

- **Unreviewed community entries.** Signed-in users can submit, but nothing they send is public until an admin accepts it. Auto-accept is scoped to the official provider's own published standings and does not extend to any user-writable path.
- **Live tournament coverage.** The source's tv endpoints could stream per-round standings mid-event, but the archive is curated meta history, not a live ticker. The event-day escalation loop is where such a surface would hang if it ever becomes a product decision.
- **Version history of source data.** The candidate row keeps the current source version and the live row keeps the curation; that diff is the comparison that matters. No snapshot-per-fetch archive.
- **Raw catalogue storage.** The catalogue mirror stores the slim projection only; full listing rows for a quarter-million events would cost an order of magnitude more for no read path.
- **Legacy/v1 source endpoints.** The fetcher uses v2 endpoints exclusively; they expose no emails or real names, and that boundary is load-bearing, not incidental.
- **Player profiles.** The source's player identity is stored (`uvsgames_players`), but no public surface aggregates across events: no player pages, no claim flow, no leaderboards, no surfacing that a player has an OpenRift account. Contributor credit names whoever entered the data, never who played the deck.
- **Aggregate statistics.** The archive does not build aggregate statistics; it publishes the results themselves.
- **Trade execution from an archived deck.** Collection integration only.

## Deferred / Out of Scope

- **Promote-from-runner.** Needs its own consent design.
- **Card-detail reverse link and the `card=$cardId` deck-browser chip.** Both ship together as one fast-follow.
- **Archetype labels.** Legend + champion already imply the archetype to a reader.
- **Snapshot freezing, forked-from metadata, slug history/redirects.**
- **Deck-level source citation.**
- **Contributor totals and a contributors page.**
- **Deck-similarity clustering.**
- **Notifications** ("new event", "new deck for your legend").
- **Region grouping beyond the stored country code, multi-format events, prize/registration metadata.**

## Confirmation

Schema-level invariants exercised by integration tests:

- `meta_events.slug` matches the URL pattern and rejects reserved names.
- Deleting a `meta_events` row cascades to its player rows; deleting a `decks` row referenced by a player row is refused until the reference is cleared.
- A player row's `deck_id` and `list_status` agree: no deck with `none`, no `partial`/`full` without a deck.
- The `meta-archive` user cannot authenticate.
- Only the `admin` role can write the live tables, the catalogue triage, or the sync controls; non-admin requests get 403.
- Every `decks` row referenced by `meta_event_players` has `user_id = 'meta-archive'` and `is_public = true`.
- Rotating `share_token` on a deck referenced by a player row returns an error.
- Fork creates a new `decks` row owned by the requester with `is_public = false`, copies all `deck_cards` rows, and inserts no archive rows.
- Catalogue upsert is hash-gated: an unchanged listing row updates `last_seen_at` and nothing else; a changed one updates the projection; a row missing from a covering crawl gets `missing_since` set and is not deleted.
- Accept (manual or auto) creates the live event, the linked candidate, and queues the deep fetch; dismiss writes the ignore table and auto-accept never fires for an ignored key.
- The official-template rule accepts a catalogue row whose template id is watched only while its toggle is on, and an unwatched template id never matches.
- A crawl stores every template the vocabulary endpoint publishes and leaves `watched` alone; a template the endpoint drops keeps its row, its name goes null, and its events keep theirs.
- A field whose registrations carry zero wins and zero losses throughout stages null records instead of the source's placeholder counters; a two-player field keeps its drawn record.
- Ignoring a candidate leaves its row and live link intact; un-ignore followed by a re-fetch resolves to the same live rows and never stages a duplicate.
- Auto-accept refuses an event whose source format does not map to `decks.format`.
- Upload and fetch both wholly replace their own candidate, leave other candidates untouched, skip ignored keys, and reset `checked_at` only on changed rows.
- A deck with an unresolved card name cannot be accepted; a player row with an unresolved legend name can be accepted without a legend only by explicit admin action.
- Linking a second provider's candidate to an existing event creates no second live event, and after a re-fetch both providers' candidates still resolve to the same live id.
- `acceptMetaEventField` writes exactly the named column; linking writes that provider's citation row and unlinking removes it.
- A `candidate_meta_players` row has exactly one of `candidate_event_id` / `meta_event_id`.
- Accepting a user-submitted deck writes one `meta_credits` row and settles its ledger row; declining settles it to the chosen resolution with the admin's note.
- Taking everything from one source refuses, naming the others, when the live event has more than one linked candidate and the caller did not confirm.
- Match suggestions offer nothing outside the hard gates (format equal, date within three days, normalized player-name overlap).
- A match row's shape holds: `player2` is null exactly on a bye, and a winner is always one of the participants, staged and live alike.
- Re-fetching a round replaces exactly that round's staged matches; rounds already held are never requested again.
- A staged match materializes only when every participant has a live player row; one whose participant was skipped stays unstamped and goes live on a later visit without a refetch.
- Deleting a live player cascades away its live matches while the staged rows survive with `meta_event_match_id` null, and re-accepting the player restores them.
- The upload endpoint requires an admin; non-admin keys get 403.

Read-path behaviour exercised by vitest tests:

- `/meta`, `/meta/events`, `/meta/$slug`, `/meta/decks`, `/meta/decks/$token`, `/meta/legends`, and `/meta/legends/$slug` all render for an unauthenticated request.
- No archive surface renders a percentage, a rate, or a share.
- The event page renders the full standings table including deckless players, lists every citation row, and names each contributor once.
- A contributor on `hidden` is absent from the public payload; switching to `name` or `riot_id` reveals every past contribution.
- "My decks" excludes `meta-archive`-owned decks.
- The scope counts read every player row in scope, and count a decklist only for `partial`/`full` rows.
- Rank display: exact ranks render ordinals, tier ranks render "T\<n\>", and 1/2 render "1st"/"2nd" in both modes.

## More Information

- **ADR-005 (collection tracking):** the completion overlay on the archived deck page is the same per-deck computation user decks use.
- **ADR-008 (supplemental card import):** the candidate ingest copies its pattern (source-agnostic candidates, implicit providers, presence semantics, ignore tables, candidate-side link FK, per-field compare grid).
- **ADR-036 (in-app user submissions):** supplies the user-submission design reused here.
- **ADR-033 (unified tournaments):** owns the `tournaments` tables and `/tournaments` routes; the archive shares no data or UI with the runner.
- **ADR-035 (anonymous deck builder):** provides the logged-out "Open in deck builder" path.
- Prior versions: the 2026-06-08 proposal, the 2026-08-14 rewrite, and its 2026-08-18 multi-source amendment, all in this file's git history.
