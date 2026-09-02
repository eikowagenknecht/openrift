---
status: accepted
date: 2026-08-31
---

# ADR-014: Meta Archive

> This is the third major revision (2026-08-31). It keeps the live schema, the multi-source model, user submissions, and contributor credit, and rebuilds the layer underneath them. The old text survives in git history.
>
> The second revision built the crawled sources on top of the push pipeline's staging tables, so a fetched event became a `candidate_meta_events` row before it became a live one. That adapter is the defect this revision removes. It showed up five separate ways: `candidate_meta_players` was `meta_event_players` plus seven columns rather than the source's own shape; `candidate_meta_matches` was already a source table wearing a candidate prefix; `candidate_meta_events` duplicated a link `meta_event_sources` already carried; a whole-response `raw` jsonb existed only because the matched candidate row had nowhere to keep the unmatched original; and card lists sat in jsonb while the live layer used `deck_cards`. Each was patched on its own. The through-line is that the staging layer either blobbed data or near-duplicated the live table, everywhere the live layer already modelled it properly.
>
> - **Two tiers for crawled sources, not three.** A source mirror holds what the source published, in the source's own vocabulary, as ordinary tables. Promotion writes the live row directly. `candidate_meta_events` and `candidate_meta_matches` are gone; the crawled sources no longer pass through staging at all.
> - **No raw payloads.** Each source projects an explicit column list into its mirror. The `raw` jsonb dies with it, along with `sanitizeDetail`, the one-field email denylist that guarded it.
> - **Overlays replace candidates.** What survives of the staging layer is a sparse patch: a row shaped like the live row with everything nullable, plus a `claimed_fields` mask saying which fields it sets. One mechanism serves admin corrections and user submissions alike.
> - **Live rows are derived.** `live = promote(source) + accepted overlays`, applied in order and rebuildable at any time. This retires `meta-reclassify`'s equality heuristic, which inferred "a human edited this" by checking whether a live value still matched what the pipeline last claimed.
> - **Card lines are tables at every tier.** Source, overlay, and live each hold their lines as rows, with a real FK to `cards` wherever the tier has resolved one.

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
- **Curated, with a rule-gated exception.** A human accepts an event into the archive, except official-source events matching admin-controlled auto-accept rules, which go live unreviewed because they are the source's own published results and the admin can override any field afterwards. Everything a _user_ writes still waits for review.
- **The original stays in the DB.** Source data can be wrong, so every live field is overridable. The source mirror keeps the untouched version, so drift between source and curation stays visible. No version history beyond that: current-source-vs-live is the comparison that matters.
- **The live row is derivable.** Nothing is knowable only as a live value. Promotion plus the accepted overlays reproduces any live row from the mirror, which is what makes a rule change safe to re-run and a bad projection safe to fix.
- **Store the shape, not the response.** Every tier holds named, typed, constrained columns. An API response is projected on arrival into an allowlist of fields the archive uses, never parked whole.
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

We reuse the `decks` shape with a synthetic owner, model results as a per-player standings table with decks as optional attachments, and build the fetchers for the crawlable sources into the application: a slim in-DB catalogue mirror, scheduled windowed crawls, admin triage with auto-accept rules, and deep fetches that write that source's own mirror tables.

The archive has two tiers and one side channel.

- **Source mirrors** (`uvsgames_*`, `playloltcg_*`) hold what a source published, keyed by its own ids, in its own vocabulary. Card names are the names the source printed; nothing here is matched against the catalog.
- **Live tables** (`meta_*`) hold the archive's answer. Promotion reads a mirror and writes live rows in place.
- **Overlays** (`meta_event_overlays`, `meta_event_player_overlays`) are sparse patches on top. An admin correction and a user submission are the same kind of row, distinguished by who wrote it and whether it has been accepted.

A live row is always `promote(source) + accepted overlays`, in that order. Re-running it is the mechanism for a rule change, a projection fix, and a re-fetch alike, which means no code path anywhere needs to guess whether a value was set by a human.

Push providers have no crawler and therefore no mirror. They write overlays directly, which is what an overlay proposing a not-yet-existing event is for.

### Consequences

- Good, because the deck rendering, deck-code import, legend/champion detection, and collection completion overlay are inherited with zero new mechanisms.
- Good, because fork is the existing "duplicate deck" mutation, and the logged-out equivalent is the anonymous-builder import (ADR-035).
- Good, because the standings pyramid stores what the source actually has: every event gets full standings and a legend breakdown, not just the rare published decklists, which multiplies the events worth archiving.
- Good, because results of an accepted event land within about an hour of it finishing, and a decklist publication weeks later merges onto the already-live event with no human in the loop.
- Good, because old completed events are crawled once and never again; the steady-state request budget is a few hundred per week against a source that serves a global event locator.
- Good, because the mirror doubles as the stored original: every live field is overridable and the compare grid shows source-vs-curation drift whenever the source changes.
- Good, because a live row can be rebuilt from the mirror plus its overlays, so fixing a bad projection or re-running a classification rule is a re-promote rather than a migration that has to guess which values a human touched.
- Good, because only projected columns are ever stored, so a field the source adds later cannot silently land in the database. The PII boundary becomes an allowlist instead of a denylist that has to keep up with an undocumented API.
- Bad, because archived decks aren't frozen: an admin editing a `decks` row retroactively changes "history." Accepted in exchange for code reuse.
- Bad, because `users.email` is NOT NULL, so the synthetic owner carries a placeholder address. It has no `accounts` row, so no credential or OAuth path can produce a session for it.
- Bad, because auto-accepted events go live with nobody having looked at them. Scoped to official-source standings under rules the admin toggles, and every field remains editable after the fact.
- Bad, because the uvsgames client lives in the public codebase and is coupled to an API that publishes no schema and can change shape without notice. The failure mode is a stalled sync surfaced in the admin UI, not corrupted data, since everything lands in that source's mirror first and promotion is re-runnable.
- Bad, because a TO who publishes decklists more than the recheck horizon (~90 days) after their event is only caught by a manual full resync.
- Bad, because a second source still doesn't accept in one click: confirm-the-match, then set a source priority, for every event two sources cover.
- Bad, because a field the archive never projected cannot be recovered locally. Adding a column means re-fetching the accepted events, which is hundreds of requests rather than the mirror's hundreds of thousands, and only for events that were actually accepted.
- Bad, because promotion has to update live rows in place rather than replacing them: `decks.id`, `meta_event_matches.player1_id` and the public share tokens all hang off `meta_event_players.id`, so identity is load-bearing and a re-promote has to match rows on their source key.

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
- `source_identity text`: the identity promotion actually filed the row under, stamped once and read on every later promote instead of re-derived from columns an overlay may have since rewritten. `u<uvsgamesPlayerId>` for a uvsgames-keyed row, `r<registrationId>` for a uvsgames row the source keys only by registration, `p<playerKey>` for a playloltcg row. `(meta_event_id, source_identity)` is unique where set. Rows written before this column existed match on a legacy identity derived the same way the pre-repair code did (`u<id>` where an id is known, else the normalized name); the match stamps `source_identity` so the row never falls back to the legacy path again.
- `wins`, `losses`, `draws smallint`: nullable, structured; display derives "5-1-0". Replaces the free-text `record`.
- `legend_card_id`, `champion_card_id uuid`: nullable FKs to `cards`. The legend lives here even when a deck exists, so every surface reads one column; the accept flow syncs it from the deck's legend zone when a list lands, from `deck_defining_card` otherwise.
- `deck_id uuid`: nullable UNIQUE FK to `decks`, ON DELETE RESTRICT. Deleting an archived deck must not silently delete a standings row; the admin path clears the reference and `list_status` first, then deletes the deck.
- `list_status text`: `none` / `partial` / `full`, with `CHECK ((deck_id IS NULL) = (list_status = 'none'))`. `partial` means the main deck is complete and side zones may be missing, so a partial list is still a list wherever the archive counts one. The old `archetype` status is gone: a legend-only entry is a player row with `list_status = 'none'`.

Only rows with a deck have a deck page. The public URL slug is `decks.share_token`, minted when the deck is created, which is exactly when a list becomes known; a player row without a deck has nothing to render and never appears in the sitemap. Rotating the share token is rejected while a `meta_event_players` row references the deck, so permalinks stay stable.

### Catalogue sync

A `uvsgames_events` table mirrors the source's full event listing as a slim projection: key, name, start time, estimated end, the source's status fields (`display_status`, `decklist_status`), player count, event format, configuration template id, store, location, and a content hash of the projection. The table is deliberately named for its source and carries no provider column: it is one API's shape, and the second crawlable source got its own mirror built around its own API rather than a premature generalization. Only `meta_event_sources` and the overlay layer are provider-keyed, because only they genuinely take multiple sources. All ~266k rows are stored (roughly 70–90 MB; the floor can't be recomputed for rows never stored), but never the raw listing row, which would be an order of magnitude more.

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

A second source is crawled: the official Chinese app, playloltcg. It gets its own mirror rather than a generalization of the first, because its ids, its listing and its lifecycle vocabulary are its own. Only promotion and the overlay layer are shared.

Three tables hold it, shaped after the uvsgames trio:

- `playloltcg_shops`: the store registry (`shop/searchShop`, ~1 515 rows in one call). It carries structured geography (province, city, area, address, coordinates) and the only stable store id the source publishes.
- `playloltcg_events`: the listing mirror, keyed on the source's `activityShopId`. Discovery is a global date-window query (`activityShop/page` over a start/end range with an empty user location returns every event nationwide), so the crawl walks date ranges exactly as the uvsgames one does. The venue lives on the event, not on the shop: the listing repeats the address per row, and an event can run away from the store. The listing never links its shop, so `shop_id` stays null until the deep fetch reads the exact `shopInfoResponse.id` off the event detail, with `shop_name` as the display fallback until then. `status` is the source's `sortWeight` lifecycle (1 registration-open through 5 finished), which the recheck ladder reads the way it reads `display_status`.
- `playloltcg_event_checks`: the recheck queue, one row per accepted event, split from the mirror for the same reason `uvsgames_event_checks` is.

The source paginates two different ways, and neither is `pageNum` alone. The event listing honours `pageNum` but will not return more than 10,000 rows for one query however it is paged, and it sorts the oldest day last, so a query whose range holds more silently loses its earliest days. The crawl therefore halves a date window whenever the response fills a page, which costs an extra request only for a window that actually overflowed. The standings endpoint ignores `pageNum` entirely and cursors on `startFinalRanking` instead, returning ranks above the one it is given; ranks are a dense sequence from 1, so the cursor never straddles a tie. Neither endpoint reports a total, so a full page is the only signal that there is more, and treating the page's own length as a total is what truncated both walks at their first page until 2026-09.

There is no template rule and no notable-name rule here. The source's `activityType` is a blunt bucket, spanning city qualifiers down to casual nights, so the registered player count is the only auto-accept signal and everything else waits for a human. Events are filed as constructed.

Both sources promote into the same live tables under their own provider string, so linking, citations, overlays and the ignore tables are one pipeline with two producers. Scheduling stays per-source: `CRON_META_PLAYLOLTCG_SYNC` and `CRON_META_PLAYLOLTCG_RECHECK` sit beside the uvsgames pair, all four unset by default, and `META_PLAYLOLTCG_BASE_URL` aims the client at the source the way `META_SYNC_BASE_URL` does for uvsgames, so a test deployment can point either at a recorded fixture server.

> Schedules now live in the `job_schedules` table, managed on `/admin/jobs`, not in `CRON_*` env vars (2026-09-02).

### Admin catalogue triage and auto-accept

The admin UI presents the catalogue as a filterable list (status, player-count floor, decklists published, name, date) with two actions per row:

- **Accept** creates the live `meta_events` row, writes its `meta_event_sources` link, and queues the deep fetch. When the fetch lands, promotion writes the standings and legends onto live player rows.
- **Dismiss** writes the existing ignore table, so the row drops out of the "new" filter and ingest skips it forever.

Triage state is derived, never stored on the catalogue row: "new" means no `meta_event_sources` row links the key and it isn't ignored.

**Auto-accept rules** run at sync time against catalogue changes: an event running a watched template from `uvsgames_event_templates`, a player count at or above a threshold, or a name matching the notable vocabulary. Each rule is an admin-controlled toggle, and all of them sit behind the format mapping, so an event whose source format maps to no `deck_formats` slug is never accepted automatically. The template rule is checked first: the organizer picked that template and an admin decided it was worth watching, where a name is free text. A matching event is accepted exactly as if clicked, including the straight-to-live standings. This is the deliberate exception to "curated, never unreviewed", scoped to the official provider's own published results; decklists whose card names don't all resolve, format mappings that fail, cross-source merges, and every non-official source still wait for a human. Auto-accept never fires for an event already dismissed.

A rule only ever judges the rows the crawl that ran it wrote, and the hash gate means an unchanged row is not written at all, so a rule turned on today reaches nothing already sitting in the triage list. The **Auto-accept backlog** job on the Sync panel runs the same rules over every row still awaiting triage, one job kind per source (`meta.<source>_auto_accept`). It is a job rather than a request because the catalogue holds six figures of rows, and it is behind a confirmation because each match it finds becomes a live event.

### Deep fetch

Per accepted event, the fetcher pulls the event detail, the registrations (players, records, final standings, deck references), the final overall standings, the final completed round's per-round standings (for `deck_defining_card`), and every completed round's match list, roughly five requests plus one per round. Individual decklists are fetched, one request each, only when the listing says `decklist_status` is PUBLISHED. A round's matches are locked once it completes, so each round is fetched once, ever: rounds already staged are skipped on later visits, the same accumulate-and-never-retry contract decklists follow.

The fetch writes the source's own mirror tables and nothing else: `uvsgames_event_standings`, `uvsgames_event_matches`, `uvsgames_event_phases`, `uvsgames_decklists` and its `uvsgames_decklist_cards`. Every one is keyed by the source's ids and holds the source's vocabulary. No card is matched, no format is mapped, no tier is classified at this tier. Those are promotion's job, and keeping them out of the mirror is what makes a re-promote able to correct them.

**Responses are projected, never parked.** Each endpoint has an explicit column list, and a field the archive does not project is discarded on arrival. That is the whole storage contract: there is no `raw` column, and the previous revision's `sanitizeDetail` (which stripped exactly one known email field out of a whole response before storing it) has nothing left to guard. The projection list is part of this ADR because it now defines the ceiling on what the archive can ever know about an event:

- **Detail** → the event's phase structure (`uvsgames_event_phases`: order, name, round type, round count, rank required, max game wins) and the round ids the match fetch walks.
- **Registrations** → one `uvsgames_event_standings` row per player: registration id, user id, wins, losses, draws, match points, the three tiebreaker percentages, entry status, final standing, and the source's deck reference where it names one.
- **Final standings and the last completed round's standings** → the rank and `deck_defining_card` name written onto the same standings row.
- **Round matches** → `uvsgames_event_matches`: round id, phase order, round number, table number, bye and draw flags, both participants' user ids, the winner's user id, games won per seat, and the source's own match id.
- **Decklists** → `uvsgames_decklists` (one row per source deck id, with a fetch status) and `uvsgames_decklist_cards` (zone, quantity, and the card name exactly as published).

Nothing else is stored. Store contact details, player emails, and every other field these endpoints carry are dropped at the projection, not after it.

**Accumulate, never retry.** A completed round's matches and a published decklist are both immutable at the source, so each is fetched once. The bookkeeping that used to require scanning the raw blob is now a column: `uvsgames_decklists.fetch_status` records `fetched` or `refused`, and a refused deck is never requested again. "Which decks are still outstanding" and "is this event's deck coverage complete" become ordinary queries instead of an `Object.hasOwn` walk over jsonb.

A completed deep fetch stamps `uvsgames_events.results_fetched_at`, unconditionally: the recheck ladder reads this column rather than checking whether the mirror holds standings rows, because a cancelled event or one with no placements legitimately has none and must still count as fetched, not be retried forever.

### Pairings

The source publishes every completed round's match list through the same v2 surface the rest of the fetch uses (`/api/v2/tournament-rounds/{id}/matches/paginated/`; participants are user ids and public handles, no PII). One match is a handful of integers and flags: table number, bye and draw markers, games won, the winner.

`uvsgames_event_matches` holds them, referencing `uvsgames_players` directly. Participants are ordered deterministically (by user id), which makes `(external_id, round_id, player1_uvsgames_id)` the mirror's primary key, without needing to trust the source's own match id for storage at this tier: one row per round per first-seat player, and a bye keeps its single player in that seat. A re-fetch replaces per round in one transaction, so a mid-event capture is corrected by the next visit and never duplicated. The row still carries the source's own match id, `source_match_id`, because the live tier does need one: a re-promote has to recognize the same match on a second run without relying on seat position, which shifts if a bye is added or removed between visits.

The live table `meta_event_matches` hangs off `meta_event_players`, not the source layer, so a hypothetical second pairings source would land the same way standings do. Promotion writes it after the player rows exist: a mirror match goes live only when both participants resolve to live player rows through their uvsgames ids, and one that does not is simply not promoted yet. The live upsert keys on `(meta_event_id, source_match_id)` where a source supplied one, falling back to the old `(meta_event_id, phase_order, round_number, player1_id)` seat key only for a row with none; both are enforced as partial unique indexes so the two identity schemes never collide. There is no stamped-back link on the mirror side and no retry queue, because promotion is idempotent and re-runs from the mirror. Deleting a live player cascades away its live matches, and the next promote restores them.

This is the one place the previous revision already had the right shape. `candidate_meta_matches` keyed its participants on `player1_uvsgames_id` / `player2_uvsgames_id`, which is a source table in everything but name and prefix; the change here is mostly the rename and dropping the materialization bookkeeping that the derive-live model makes unnecessary.

Pairings are published as per-match facts: the event page's top-cut bracket reads the stored matches directly. Events whose top cut was not played keep their matches archived with nothing rendering them.

### Multi-source events

Two sources describing the same tournament have to land on one live event. `meta_event_sources` is the link, and it already carried `(meta_event_id, provider, external_id)` for its citation duty; the previous revision's second link through `candidate_meta_events.meta_event_id` was a duplicate of it and is gone.

Precedence is per source, not per field. `meta_event_sources.priority` orders the mirrors feeding one live event, and promotion applies them lowest number first, so the last writer wins on any field two sources both hold. Wanting one field from the lower-priority source is an admin overlay claiming that field, which is the mechanism that already exists for every other correction. The previous revision's per-field accept grid, where a reviewer took individual cells from individual candidates, is retired: it needed the diff engine, the field vocabulary and the whole-entity guard, all to express something two priorities and an occasional overlay cover.

- Linking is separate from promoting: a source whose values lose every field still contributed, and its citation does not depend on winning any of them.
- Player rows reconcile on `source_identity` within an event where two sources key the same identity, and on the admin's assignment otherwise.
- A hand-entered event has no `meta_event_sources` row with a provider, so promotion has nothing to run and its live values come entirely from overlays.

**Match suggestions.** The sync proposes and the admin confirms; suggestions are ranked hints, never applied automatically. Hard gates before scoring: an event is only a possible match when its mapped format agrees and its date is within three days (a multi-day event gets filed under different days by different sources), and a player only when the normalized name overlaps.

### Overlays

An overlay is a sparse patch on the live row. It has the live table's columns, all nullable, plus `claimed_fields text[]` naming the ones it sets. Everything unclaimed falls through to promotion.

```
tier = 'premier', organizer = NULL, claimed_fields = '{tier,organizer}'
```

That reads as "set tier to premier, clear organizer, leave the rest to the source". The mask is what makes clearing a field expressible at all: without it a NULL column cannot be told apart from an absent one, and every nullable field in both live tables would be unclearable.

Typed columns rather than a jsonb patch, even though presence-of-key would be a mask for free. The live tables' CHECK constraints (the tier enum, the `^[A-Z]{2}$` country regex, the length bounds, the tiebreaker ranges) are the reason: a patch bag keeps none of them, and this repo validates vocabularies at the database level and ties them back to shared zod schemas in `enum-checks.integration.test.ts`. Three constraints keep the mask honest, all generated in the migration rather than written out by hand:

- every `claimed_fields` element is in the overlay's field vocabulary, declared once as a zod enum in shared and registered in that test;
- one consistency CHECK per column, `CHECK (tier IS NULL OR 'tier' = ANY (claimed_fields))`, so a value set without being claimed cannot be stored and then silently ignored;
- `claimed_fields` is non-empty, because an overlay claiming nothing is a bug.

**One mechanism, two authors.** An admin correction and a user submission are the same row. What differs is `submitted_by_user_id` and `status`: an admin's overlay is born `accepted`, a user's starts `pending` and an admin settles it. Applying is therefore uniform, and "pending changes nothing" falls out of the status rather than out of a separate table. Automation that writes an overlay (there is none today, but a future rule-based correction would) authors it as the `meta-archive` system user; everything a person writes carries that person's id, so the audit trail costs nothing extra.

**Admin corrections merge per author.** The event dialog and the drift view both write through the same call: one admin's edits on one event fold into a single accepted overlay row per `(event, author)`, so ten field edits over a session are one row claiming ten fields rather than ten rows a later promote replays in sequence, and `accepted_at` moves to now on every merge. A different submitter keeps a separate row. Handing a field back to the sources drops it from every accepted overlay claiming it: an admin-edit row whose last claim goes is deleted outright, while a submission keeps its row and is rejected instead, since its `claimed_fields` must stay non-empty and rejecting is what reads correctly in the submitter's own ledger. The admin's slug-rename endpoint is the one exception that writes `meta_events` directly; every other field goes through this path, so a re-promote can never silently revert an edit the way updating the live row in place once could.

**A standings row is corrected the same way, and there is no PATCH for one.** A present key is claimed, a null on a nullable field clears it, and one admin's edits on one row merge into a single accepted overlay per `(row, author)`, exactly as `writeEventOverlayFields` does for the event. `playerName: null` claimed hands a source-keyed row's name back to whatever the source calls the player, propagating a source rename again; claiming it null on a row with no source identity is refused, since it would leave the row with nothing to display. Releasing a field works the same way as the event path, with one twist: releasing `cards` or `listStatus` releases both together, because a list and its completeness can never be claimed, or released, out of step with each other. A `cards` claim of zero lines is the opposite of a submitted list: it says there is no list, and promotion detaches the standings row's deck rather than leaving the sources free to reattach one, which is what makes the claim durable against a source that keeps publishing a decklist for that row. Its card lines carry `preferred_printing_id`, so a pasted deck code keeps the exact printings the admin chose rather than falling back to promotion's null default. The admin players list reports each row's `claimedFields`, aggregated from its accepted overlays, so the table shows which cells the sources no longer decide.

**Ordering.** Overlays apply after promotion, oldest accepted first, so a later correction beats an earlier one on the same field. Two overlays claiming the same field is normal, not a conflict to resolve.

**Proposing something new.** An overlay with a NULL target proposes rather than patches: a `meta_event_overlays` row with no `meta_event_id` is a proposed event, and accepting it mints the live row. Players under it point at the event overlay through `meta_event_player_overlays.event_overlay_id`, so a whole event and its field arrive as one reviewable unit and are accepted together. This is what a push provider and a user proposing an unlisted event both write, and it replaces the previous revision's trick of inventing a placeholder candidate event to hang a player off.

**Accepting a proposal validates before it commits.** A proposal needs a name, a date and a format to become a live row, and that check runs before anything is written, so a proposal that fails it stays `pending` rather than turning `accepted` with no live event behind it. Accepting also has a third path beyond patch-existing and mint-new: the reviewer can point a proposal at a live event the archive already has, which is the match-suggestion flow's outcome. That path adopts the proposal's players onto the target event, promotes it, and never mints a second live row for the same tournament.

**Pushed standings get a stable identity too.** `meta_event_player_overlays` carries `provider` + `source_player_key`, unique together where set, so a push provider's re-upload of the same standings row updates the overlay it already wrote instead of filing a duplicate. The key survives the overlay being re-anchored: a player overlay proposed under an event that is itself still a proposal keeps its `(provider, source_player_key)` once the event is accepted and the overlay is repointed at the live row.

**Anchoring a player overlay to a live row happens two ways.** A reviewer can anchor one directly, acting on a player match suggestion; if the overlay is already accepted this promotes immediately. Otherwise an overlay targeting `meta_event_id` rather than a specific row (a submission for a player the archive may or may not already list) is placed automatically the next time the event promotes: matched onto the row whose rendered name it names, with rank breaking a tie on a shared name; minted as a new row when it names nobody the event lists and claims both the name and the rank a row cannot exist without; and, failing both, reported in `MetaPromoteResult.errors` rather than silently dropped, since an accepted overlay that never lands would read as data loss. Either way the resolution is written back onto the overlay so the next promote applies it directly instead of re-resolving.

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

A provider row is written when a mirror is linked to a live event and removed when it is unlinked; it doubles as promotion's source list, ordered by `priority`. A hand-entered row carries no provider key and feeds no promotion. Citations answer "where did this data come from" and are public; they never carry a user. Deck-level citation is deferred.

### Card lists, formats, legends

The live card list is `deck_cards`, unchanged. The two tiers above it hold their lines as rows too, differing only in how much they know:

| tier    | table                             | card identity                              |
| ------- | --------------------------------- | ------------------------------------------ |
| source  | `uvsgames_decklist_cards`         | the name as published, no `card_id` column |
| overlay | `meta_event_player_overlay_cards` | `name` plus nullable `card_id`             |
| live    | `deck_cards`                      | `card_id` NOT NULL, FK to `cards`          |

The previous revision kept the middle tier as jsonb, justified in a code comment as "written whole, read whole, and never queried across rows". That was already untrue: the accept path scanned the array in application code to find unresolved names, because SQL could not reach into it. Rows make that a query, and they give the resolved `card_id` a real foreign key, which a uuid inside a blob never had. A merged or deleted card used to rot every list holding it with no constraint firing.

Card matching happens exactly once, on the way from source to live, and resolves through the same normalized-name and `card_name_aliases` path the card pipeline uses. Format is `decks.format`. A deck's legend and champion come from the existing legend/champion zones (`packages/shared/src/deck-rules.ts` vocabulary) and are written onto the player row by promotion. The collection overlay sums copies across all printings of the underlying card.

**A deck attaches only when every line resolves and inherits the event's format.** A source's list with one unresolvable card name promotes the standings row without a deck, not with a partial one; the unresolved name still surfaces to the reviewer. The archived deck itself is written in the event's own format, so a deck's `decks.format` always agrees with the standings it belongs to; a list an admin claims through the standings-row overlay carries no format of its own for the same reason. `list_status` is computed, not assumed: `partial` means every required zone but the side ones is filled, and a standings-only legend (the common case, from `deck_defining_card` rather than a published decklist) counts as held, so a list whose source Legend zone came back empty still reports `full` once the resolved legend is filed into it. Promotion never overwrites what it does not need to: a re-promote whose card lines are unchanged from what is already stored rewrites nothing, and it preserves a maintainer's deck rename by asking to keep the existing name rather than overwriting it with the freshly computed one. A name is not overlay data either: an admin's rename of a standings row's list is applied as a direct rename of the derived deck, run right after that promote, and it survives later re-promotes because promotion already preserves whatever name the deck holds.

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

A signed-in user can submit a decklist for an event the archive already has, or propose an event it does not. This is ADR-036's design applied to a second entity, and it is now the same mechanism an admin uses to correct anything.

- **Target.** A submission is a decklist for a player, so it writes a `meta_event_player_overlays` row against the live event, claiming the fields it fills. A submission for a player the archive does not list yet is one with a NULL player target, which accepting mints.
- **Proposing an event** writes a `meta_event_overlays` row with a NULL `meta_event_id`, carrying the fields the person typed. An admin accepts or rejects it through the same actions.
- **Attribution.** `submitted_by_user_id` and `submission_note`. The author is always recorded, whether that is a person or the `meta-archive` system user.
- **Ledger.** `meta_submissions` (renamed from `meta_deck_submissions`), shaped like `card_submissions`: user, target, status, resolution reason and note, resolver, timestamps. Accepting the overlay settles its row to `accepted`; declining needs an explicit admin resolution (`rejected`, `not_applied`, `already_correct`) with an optional note, so nothing reads as pending forever.
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
- **`/admin/meta`**: event list with create/edit, an **Overlays** queue (pending submissions and corrections) and a per-event **Drift** view, plus a **Catalogue** tab (the triage list above, with the auto-accept rule toggles and the manual full-resync action) and a **Sync** panel showing recent `meta.*` job runs and any stalled state.

A scope bar (era, format, tier, country) is shared by every archive page and encoded in the URL. The era is one window; format, tier and country are include/exclude axes cycling the same way the card browser's do (ADR-034), so "every country but this one" is a pick rather than a dead end. The tournament index adds a holdings filter, since an archived event starts as a date and a name. Every name `/meta` spends on a static child is a reserved event slug, so no event can be shadowed by one.

The byline for an archived deck everywhere is player + rank + event, never an account owner. Navigation: a "Meta" entry in the main header, shown only while the flag is on.

### Ingest and promotion

Two producers, two paths, converging on the live tables.

- **The in-app fetchers** (uvsgames, playloltcg) write their own mirrors, then promote. Promotion is idempotent and re-runnable: it matches live rows to mirror rows on `meta_event_players.source_identity`, updates in place, inserts what is missing, and applies the accepted overlays afterwards. Live row identity survives, which it must, because `decks`, `meta_event_matches` and the public share tokens all hang off `meta_event_players.id`.
- **Every event field starts from the live row.** Promotion computes all nine `meta_events` columns (name, date, format, player count, organizer, notes, tier, country, location) by starting from what the row already holds, then letting each linked source overwrite in priority order. An event with no usable source facts, hand-entered, or whose mirror is gone, keeps every field it has rather than resetting to a blank default; a source that contributes only some fields leaves the rest exactly where they were.
- **The push endpoint** (everything else): `POST /api/admin/v1/meta/upload` with `{ provider, events: [...] }`, admin API key auth. A push provider has no crawler and so no mirror; its payload becomes overlays, keyed `(provider, external_id)` for the event and `(provider, source_player_key)` for each player, so a re-upload updates rather than duplicates either. An unchanged row is left alone; a changed one restates the whole event or player and reopens review by resetting its status to `pending`. Every upload is written to the admin event ledger under `meta-overlays.upload`, with the counts of new, updated, unchanged and ignored rows.

Shared semantics:

- Events are keyed `(provider, external_id)` in `meta_event_sources`; player external ids are scoped to their event. Providers are implicit: a new string is a new provider.
- **Card matching happens at promotion**, resolving names through the normalized-name and `card_name_aliases` path the card pipeline uses. A player row promotes whether or not its list resolves; the deck attaches only when every line does, so a legend-only standings row is the normal outcome rather than a failure. Unresolved lines are a query over `meta_event_player_overlay_cards` and the source card tables, which is the admin's actual review queue.
- **Rejection.** `ignored_meta_source_events` keyed `(provider, external_id)` and `ignored_meta_source_players` keyed `(provider, event_external_id, external_id)`. Sync and promotion skip ignored keys. An ignore marks the key and leaves the mirror row in place, so ignore, un-ignore, re-fetch is idempotent rather than a duplicate-archiving bug. These are the previous revision's `ignored_candidate_*` tables, renamed to match the tier they now guard.
- **Outcome ledger.** Fetcher promotion gets none; user submissions get `meta_submissions`, whose payload is now the overlay row it points at.

### Review screen

Two things need reviewing, and they are no longer the same screen.

**Drift.** For a live event, show each linked mirror beside the live row and highlight where they disagree. This is a read: the reviewer's actions are to change a source's priority, or to write an overlay claiming a field. There is no per-cell accept, because taking one source's value for one field is exactly what an overlay is, and a second way to express it would be a second thing to keep consistent.

**The overlay queue.** Pending overlays, oldest first, each showing the fields it claims against the current live values, with accept and reject. A user's decklist submission expands to its lines, with unresolved card names called out; those are a join now, not a scan.

The single-source path stays one click: an event whose mirror nobody has contradicted needs no review at all, which is what auto-accept already relies on. The multi-source path is confirm-the-match once, then set priority once, and only the exceptions become overlays.

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
  missing_since   timestamptz,              -- a covering crawl no longer returned the row
  results_fetched_at timestamptz            -- a deep fetch completed, standings or none;
                                            -- the recheck ladder's "fetched" signal
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

-- What the deep fetch reads, projected. Source ids, source vocabulary, no
-- catalog matching: promotion owns that. Nothing here is jsonb.
CREATE TABLE uvsgames_event_standings (
  external_id        text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
  registration_id    text NOT NULL,          -- the source's per-event registration key
  uvsgames_player_id integer REFERENCES uvsgames_players(id),
  player_name        text,                   -- only where no keyed user exists
  rank               integer,
  wins smallint, losses smallint, draws smallint,
  match_points       integer,
  opponent_match_win_pct double precision,
  game_win_pct           double precision,
  opponent_game_win_pct  double precision,
  entry_status       text,                   -- source vocab: complete | eliminated | dropped
  legend_name        text,                   -- deck_defining_card, as published
  source_deck_id     text,                   -- the deck this registration references
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (external_id, registration_id),
  CHECK (uvsgames_player_id IS NOT NULL OR player_name IS NOT NULL)
);

CREATE TABLE uvsgames_event_phases (
  external_id  text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
  phase_order  integer NOT NULL,
  name         text,
  round_type   text NOT NULL,          -- source vocab: SWISS, RANKED_SINGLE_ELIMINATION, ...
  round_count  integer,
  rank_required integer,
  max_game_wins smallint,
  PRIMARY KEY (external_id, phase_order)
);

-- One row per round per first-seat player; participants are ordered by user id
-- so the key is deterministic without trusting an undocumented match id.
CREATE TABLE uvsgames_event_matches (
  external_id         text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
  round_id            text NOT NULL,
  phase_order         integer NOT NULL DEFAULT 0,
  round_number        integer NOT NULL CHECK (round_number >= 1),
  table_number        integer,
  is_bye              boolean NOT NULL DEFAULT false,
  is_draw             boolean NOT NULL DEFAULT false,
  player1_uvsgames_id integer NOT NULL REFERENCES uvsgames_players(id),
  player2_uvsgames_id integer REFERENCES uvsgames_players(id),
  winner_uvsgames_id  integer REFERENCES uvsgames_players(id),
  games_won_p1 smallint, games_won_p2 smallint,
  source_match_id     text NOT NULL,        -- the source's own id, carried to the live
                                            -- tier's upsert key; storage here still keys
                                            -- on the seat below
  PRIMARY KEY (external_id, round_id, player1_uvsgames_id),
  CHECK ((player2_uvsgames_id IS NULL) = is_bye),
  CHECK (winner_uvsgames_id IS NULL
         OR winner_uvsgames_id = player1_uvsgames_id
         OR winner_uvsgames_id = player2_uvsgames_id)
);

-- Decks are immutable once published: fetch_status replaces the old raw-blob
-- bookkeeping, and 'refused' is never requested again.
CREATE TABLE uvsgames_decklists (
  source_deck_id text PRIMARY KEY,
  external_id    text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
  fetch_status   text NOT NULL CHECK (fetch_status IN ('fetched','refused')),
  fetched_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE uvsgames_decklist_cards (
  source_deck_id text NOT NULL REFERENCES uvsgames_decklists(source_deck_id) ON DELETE CASCADE,
  line_number    integer NOT NULL,       -- preserves the published order
  zone           text NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  card_name      text NOT NULL,          -- exactly as published; never matched here
  PRIMARY KEY (source_deck_id, line_number)
);

-- The second source's mirror, on the same three shapes and sharing nothing but
-- promotion and the overlays. Geography is structured here because the source
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

-- The same projection idea on the second source's smaller surface: it publishes
-- standings and decks, no rounds and no phase structure.
CREATE TABLE playloltcg_event_standings (
  activity_shop_id bigint NOT NULL REFERENCES playloltcg_events(activity_shop_id) ON DELETE CASCADE,
  player_key       text NOT NULL,   -- 'u<userId>' where the payload carries one, else the
                                    -- name numbered among same-name rows. Never the rank:
                                    -- the source re-ranks provisional standings into final
                                    -- ones, so a rank key changes identity on a re-fetch.
  source_user_id   bigint,
  player_name      text NOT NULL,
  rank             integer,
  wins smallint, losses smallint, draws smallint,
  legend_name      text,
  source_deck_id   text,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_shop_id, player_key)
);
CREATE TABLE playloltcg_decklists (
  source_deck_id   text PRIMARY KEY,
  activity_shop_id bigint NOT NULL REFERENCES playloltcg_events(activity_shop_id) ON DELETE CASCADE,
  fetch_status     text NOT NULL CHECK (fetch_status IN ('fetched','refused')),
  fetched_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE playloltcg_decklist_cards (
  source_deck_id text NOT NULL REFERENCES playloltcg_decklists(source_deck_id) ON DELETE CASCADE,
  line_number    integer NOT NULL,
  zone           text NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  card_name      text NOT NULL,
  PRIMARY KEY (source_deck_id, line_number)
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
  -- The identity promotion actually filed the row under: u<uvsgamesPlayerId>,
  -- r<registrationId>, or p<playerKey>. Unique per event where set:
  -- UNIQUE (meta_event_id, source_identity) WHERE source_identity IS NOT NULL.
  source_identity  text CHECK (source_identity IS NULL OR source_identity <> ''),
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
  source_round_id text,                 -- the source's round id, nullable: not every
                                        -- producer of a match has one
  source_match_id text,                 -- the source's own match id; the re-promote key
                                        -- once a source supplies one
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((player2_id IS NULL) = is_bye),
  CHECK (winner_id IS NULL OR winner_id = player1_id OR winner_id = player2_id)
);
-- Two identity schemes, kept from colliding by two partial unique indexes
-- rather than one shared UNIQUE: a row with a source match id is re-promoted
-- by that id, and only a row with none falls back to its seat.
CREATE UNIQUE INDEX uq_meta_event_matches_source
  ON meta_event_matches (meta_event_id, source_match_id) WHERE source_match_id IS NOT NULL;
CREATE UNIQUE INDEX uq_meta_event_matches_seat
  ON meta_event_matches (meta_event_id, phase_order, round_number, player1_id)
  WHERE source_match_id IS NULL;
CREATE INDEX idx_meta_players_event  ON meta_event_players (meta_event_id, rank);
CREATE INDEX idx_meta_players_legend ON meta_event_players (legend_card_id);

-- Overlay layer: sparse patches applied on top of promotion. An admin
-- correction and a user submission are the same row; status and author differ.
-- claimed_fields is the mask, and the only way to express "clear this field",
-- since a NULL column is otherwise indistinguishable from an absent one.
CREATE TABLE meta_event_overlays (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  meta_event_id  uuid REFERENCES meta_events(id) ON DELETE CASCADE,  -- NULL: proposes a new event
  provider       text,          -- set for push providers, NULL for people
  external_id    text,          -- ditto; UNIQUE together so a re-upload updates
  name           text, event_date date, format text, player_count integer,
  organizer      text, notes    text, tier text, country text, location text,
  claimed_fields text[] NOT NULL CHECK (cardinality(claimed_fields) > 0),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected')),
  submitted_by_user_id text NOT NULL REFERENCES users(id),  -- 'meta-archive' for automation
  submission_note      text,
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((provider IS NULL) = (external_id IS NULL)),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
  -- Plus one generated consistency CHECK per payload column:
  --   CHECK (tier IS NULL OR 'tier' = ANY (claimed_fields))
  -- and a CHECK that every claimed_fields element is in the field vocabulary.
);
CREATE UNIQUE INDEX uq_meta_event_overlays_source
  ON meta_event_overlays (provider, external_id) WHERE provider IS NOT NULL;

CREATE TABLE meta_event_player_overlays (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  -- Exactly one target: patch a live player, propose one under a live event,
  -- or propose one under an event that is itself still a proposal.
  meta_event_player_id uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
  meta_event_id        uuid REFERENCES meta_events(id) ON DELETE CASCADE,
  event_overlay_id     uuid REFERENCES meta_event_overlays(id) ON DELETE CASCADE,
  player_name      text, rank integer, rank_is_tier boolean,
  wins smallint, losses smallint, draws smallint,
  match_points     integer,
  opponent_match_win_pct double precision,
  game_win_pct           double precision,
  opponent_game_win_pct  double precision,
  entry_status     text,
  legend_card_id   uuid REFERENCES cards(id),
  champion_card_id uuid REFERENCES cards(id),
  list_status      text CHECK (list_status IS NULL
                               OR list_status IN ('none','partial','full')),
  claimed_fields   text[] NOT NULL CHECK (cardinality(claimed_fields) > 0),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','rejected')),
  submitted_by_user_id text NOT NULL REFERENCES users(id),
  submission_note      text,
  provider           text,             -- set for a push provider, NULL for people
  source_player_key   text,            -- provider's own key; re-upload target
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(meta_event_player_id, meta_event_id, event_overlay_id) = 1),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  CHECK ((provider IS NULL) = (source_player_key IS NULL))
);
CREATE UNIQUE INDEX uq_meta_event_player_overlays_source_key
  ON meta_event_player_overlays (provider, source_player_key) WHERE provider IS NOT NULL;

-- A proposed or corrected card list. Rows, not jsonb: card_id gets a real FK,
-- and "which pending lists hold an unresolvable name" becomes a query.
CREATE TABLE meta_event_player_overlay_cards (
  overlay_id  uuid NOT NULL REFERENCES meta_event_player_overlays(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  zone        text NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  card_name   text NOT NULL,                  -- what the submitter wrote
  card_id     uuid REFERENCES cards(id),      -- NULL while the name resolves to nothing
  preferred_printing_id uuid REFERENCES printings(id) ON DELETE SET NULL,
                                              -- keeps a pasted deck code's exact
                                              -- printings through to the live deck
  PRIMARY KEY (overlay_id, line_number)
);

-- meta_credits and users.meta_credit_visibility are written out in their
-- sections above. meta_submissions mirrors card_submissions (ADR-036), its
-- target now being an overlay row. meta_event_sources gains:
--   priority integer NOT NULL DEFAULT 0   -- promotion order, lowest first
-- ignored_meta_source_events: (provider, external_id, created_at).
-- ignored_meta_source_players: (provider, event_external_id, external_id,
-- created_at). Both skip-at-promotion.
```

There are no jsonb columns left in the archive. Every tier is named, typed columns with CHECK constraints, which is what lets the field vocabularies register in `enum-checks.integration.test.ts` alongside the rest of the repo's.

Superseded and dropped:

- `candidate_meta_events`, `candidate_meta_players` and `candidate_meta_matches`. Their data has three destinations: source facts to the mirrors, curation to live, pending user input to the overlays. Live rows are untouched, so nothing the archive publishes is lost; the mirrors refill on the next recheck pass.
- `candidate_meta_events.raw`, and with it `sanitizeDetail`.

The `ignored_candidate_*` pair is renamed rather than dropped, keeping its keys and its skip-at-ingest job. `meta_deck_sources` was already gone before this revision.

## Will Not Be Built

- **Unreviewed community entries.** Signed-in users can submit, but nothing they send is public until an admin accepts it. Auto-accept is scoped to the official provider's own published standings and does not extend to any user-writable path.
- **Live tournament coverage.** The source's tv endpoints could stream per-round standings mid-event, but the archive is curated meta history, not a live ticker. The event-day escalation loop is where such a surface would hang if it ever becomes a product decision.
- **Version history of source data.** The mirror keeps the current source version and the live row keeps the curation; that diff is the comparison that matters. No snapshot-per-fetch archive.
- **Raw response storage, anywhere.** Neither the catalogue mirror nor the deep fetch keeps a response body. Everything is projected into named columns on arrival, so an unprojected field is discarded rather than stored. This costs a re-fetch when the archive later wants a field it skipped, and buys a PII boundary that is an allowlist instead of a denylist over an undocumented API.
- **Per-field source accept.** Two sources are ordered by priority and the exceptions are overlays. A grid that takes individual cells from individual sources is a second way to say the same thing.
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
- An overlay cannot hold a value it does not claim, for any payload column on either overlay table (a per-column consistency CHECK), and cannot claim a field outside its vocabulary (an array-subset CHECK, matched in `enum-checks.integration.test.ts` against the same union the field's zod enum owns).
- Promotion is idempotent: running it twice over an unchanged mirror leaves every live row's id, `created_at` and values untouched.
- Promotion matches an existing standings row on its stored `source_identity`, never a value re-derived from columns an overlay may have rewritten; a row with no stored identity still matches on the identity a pre-repair promote would have derived, and the match stamps `source_identity` so later runs skip that fallback.
- Promotion preserves live identity across a re-fetch that changes a player's rank and record, so an attached deck and its share token survive.
- A push provider's re-upload of an unchanged event or player overlay writes nothing; a changed one restates it and resets its status to `pending`, keyed by `(provider, externalId)` for the event and `(provider, sourcePlayerKey)` for the player.
- A deep fetch stamps `results_fetched_at` whether or not it found any standings, and the recheck ladder reads that column rather than counting mirror rows.
- An accepted overlay survives a re-promote; a pending one changes nothing.
- No archive table holds a jsonb column.
- The `meta-archive` user cannot authenticate.
- Only the `admin` role can write the live tables, the catalogue triage, or the sync controls; non-admin requests get 403.
- Every `decks` row referenced by `meta_event_players` has `user_id = 'meta-archive'` and `is_public = true`.
- Rotating `share_token` on a deck referenced by a player row returns an error.
- Fork creates a new `decks` row owned by the requester with `is_public = false`, copies all `deck_cards` rows, and inserts no archive rows.
- Catalogue upsert is hash-gated: an unchanged listing row updates `last_seen_at` and nothing else; a changed one updates the projection; a row missing from a covering crawl gets `missing_since` set and is not deleted.
- Accept (manual or auto) creates the live event, its `meta_event_sources` link, and queues the deep fetch; dismiss writes the ignore table and auto-accept never fires for an ignored key.
- The official-template rule accepts a catalogue row whose template id is watched only while its toggle is on, and an unwatched template id never matches.
- A crawl stores every template the vocabulary endpoint publishes and leaves `watched` alone; a template the endpoint drops keeps its row, its name goes null, and its events keep theirs.
- A field whose registrations carry zero wins and zero losses throughout stages null records instead of the source's placeholder counters; a two-player field keeps its drawn record.
- Ignoring a key leaves the mirror row and the live link intact; un-ignore followed by a re-fetch resolves to the same live rows and never creates a duplicate.
- Auto-accept refuses an event whose source format does not map to `decks.format`.
- A deep fetch replaces only its own source's mirror rows for that event, leaves other sources untouched, and skips ignored keys.
- A refused decklist is recorded once and never requested again; a completed round's matches are never refetched.
- Promotion attaches a deck only when every card line resolves; a player row with an unresolved legend still promotes, without one.
- A re-promote whose card lines are unchanged rewrites nothing, and preserves a maintainer's deck rename instead of overwriting it with the freshly computed name.
- A source list whose Legend zone is empty gets the resolved standings legend filed into it, and the resulting `list_status` reflects that rather than reporting `partial` for a list that is actually complete.
- Linking a second provider's mirror to an existing event creates no second live event, and after a re-fetch both providers still promote onto the same live id.
- Promotion applies linked sources in `priority` order, so the lowest-priority source wins a field both hold.
- Linking writes that provider's citation row and unlinking removes it.
- A `meta_event_player_overlays` row has exactly one of `meta_event_player_id` / `meta_event_id` / `event_overlay_id`.
- Accepting a proposed event mints its live row and files the players hanging off that proposal under it.
- Accepting a user-submitted deck writes one `meta_credits` row and settles its ledger row; declining settles it to the chosen resolution with the admin's note.
- An overlay claiming a field beats promotion for that field and only that field, and survives a re-promote; a pending or rejected one changes nothing.
- Two admin edits on the same event from the same author merge into one overlay row; a different author's edit does not.
- Releasing a field an admin-edit overlay claims deletes the overlay once its last claim is gone; releasing a submission's last claim rejects it instead, since its mask must stay non-empty.
- A standings-row correction merges into one overlay per `(row, author)` the same way, and releasing `cards` or `listStatus` always releases both together.
- A `cards` claim with zero lines detaches the standings row's deck at the next promote, and a source that still publishes a list for that row does not reattach one.
- Claiming `playerName: null` on a source-keyed row falls back to the source's name; claiming it on a row with no source identity is refused.
- Renaming a standings row's deck through its overlay's list survives a later re-promote, because promotion preserves whatever name the deck already holds.
- Accepting a proposal validates it has a name, a date and a format before flipping its status; a proposal missing one of those stays `pending`.
- Accepting a proposal into an existing event adopts its proposed players onto that event and mints no second live row.
- Accepting an overlay with a NULL target mints the live row it proposes.
- Match suggestions offer nothing outside the hard gates (format equal, date within three days, normalized player-name overlap).
- A match row's shape holds: `player2` is null exactly on a bye, and a winner is always one of the participants, in the mirror and live alike.
- Re-fetching a round replaces exactly that round's mirror matches; rounds already held are never requested again.
- A mirror match promotes only when both participants resolve to live player rows; one whose participant is missing promotes on a later run without a refetch.
- Re-promoting a round whose live matches already exist updates them in place by `source_match_id` rather than duplicating them.
- Deleting a live player cascades away its live matches while the mirror rows survive, and the next promote restores them.
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
- **ADR-008 (supplemental card import):** the archive borrows its implicit providers, presence semantics and ignore tables. It deliberately does not copy the candidate mirror or the per-field compare grid: those exist because a card's source rows are its only definition, where an event's live row is derivable from a mirror the archive fetches itself.
- **ADR-036 (in-app user submissions):** supplies the user-submission design reused here.
- **ADR-033 (unified tournaments):** owns the `tournaments` tables and `/tournaments` routes; the archive shares no data or UI with the runner.
- **ADR-035 (anonymous deck builder):** provides the logged-out "Open in deck builder" path.
- Prior versions: the 2026-06-08 proposal, the 2026-08-14 rewrite, and its 2026-08-18 multi-source amendment, all in this file's git history.
