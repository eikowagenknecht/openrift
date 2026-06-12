---
status: proposed
date: 2026-06-10
---

# ADR-025: Deck Check for Tournament Judges

## Context and Problem Statement

External tournament organizers collect entrant decklists through their own systems (the reference integration is a WordPress plugin under `data/decklist-code`, but the feature must not be specific to it). On tournament day a judge has to physically verify each player's unsorted deck against the list they submitted: every card present, in the right zone, at the right count. Today that check happens on paper or inside the organizer's own tooling, with no card images and no link to a real catalog.

OpenRift already knows cards, printings, deck zones, and deck rendering, and it already has a collaboration primitive (friend groups, ADR-013) for "several people share access to one thing." We want a tool where an organizer pushes their entrant decklists into OpenRift, and a team of judges (OpenRift account holders) opens each entrant, sees the deck rendered with card images, ticks cards off as they verify the physical deck, and records a verdict, with all judges seeing the same live state.

The decision is how to model the imported tournament and its entrants (reuse `decks` or new tables), how judges get access and what they are allowed to do, how the organizer's system feeds data in, and how this coexists with the two existing OpenRift concepts that already carry the word "tournament."

## Decision Drivers

- **Provider-agnostic ingest.** The reference WordPress plugin is one of several possible sources. OpenRift must expose a clean generic contract that any organizer can map onto, with no provider-specific fields leaking into the data model.
- **Entrants are not OpenRift users.** Players submit a name, an email, and a list. They do not have OpenRift accounts and never log in. Only judges do. The model must hold free-text player identity, never a `users` row, mirroring the stance ADR-014 proposes for archived pilots.
- **Decklist secrecy.** Entrant lists are private competition data before and during an event. Unlike ADR-014's public archive, these are never anonymously visible; access is restricted to the judging team.
- **Shared live state for many judges.** Multiple judges work one event at once, pick whoever is next in line (no pre-assignment), must not redo each other's work, and can re-open a check to fix a mistake.
- **A stale check must never pass a changed deck.** Players may re-submit up to a deadline. When a list changes after it was checked, the check has to be invalidated, not silently kept.
- **Reuse the existing collaboration and rendering plumbing.** Friend-group membership, invites, and join codes already model "a team of people," and `CardCell` plus the deck-rules and deck-stat code already render and validate decks. Build on them rather than re-deriving them.
- **Do not overload the two existing "tournament" concepts.** ADR-014 (`tournaments`, the proposed public curated deck archive) and ADR-022 (`pod_tournaments`, the implemented FFA pod runner) already claim the `/tournaments` hub. A third concept needs a name and a home that do not collide with either.

## Considered Options

Six independent axes, each with the option chosen below.

1. **Access and ownership:** a dedicated per-tournament judge roster with its own invite/code; reuse friend groups; or global admins only.
2. **Judge permission model:** add a `judge` value to the friend-group role hierarchy; add an orthogonal `can_judge` capability flag decoupled from rank; or assign judges per event in a join table.
3. **Entry storage:** reuse the `decks` / `deck_cards` schema with a synthetic owner (as ADR-014 proposes); or dedicated `deck_check_*` tables.
4. **Import mechanism:** the provider pushes to an OpenRift ingest endpoint; OpenRift pulls from the provider on a schedule; or manual sync only.
5. **Push scope:** each push is the authoritative snapshot of all entrants (absent entries auto-withdrawn); or partial pushes that upsert only the entries listed, with explicit withdrawal.
6. **Re-import of an already-checked deck:** invalidate the check; keep the verdict but flag it stale; or lock the entry/tournament after the first check.

## Decision Outcome

- **Access and ownership: reuse friend groups.** A deck-check event is a group-owned resource. Judges are group members. This reuses ADR-013's membership, invites, join code, and group-owned-resource pattern (already used by `collections.group_id`) instead of building a parallel roster and invite system. An external organizer creates a group, adds their judges, and runs their events inside it.
- **Judge permission model: a new `judge` role in the friend-group hierarchy,** ranked `owner > admin > judge > member`. Judging requires rank `>= judge`; managing events and push keys requires rank `>= admin`; plain `member` gets no deck-check access at all. This keeps the codebase's single-role model, lets the organizer grant judging without granting full group-admin powers, and preserves a clean PII boundary (only `judge` and above see entrant decks and emails).
- **Entry storage: dedicated `deck_check_*` tables,** unlike ADR-014. Entrants are not user-owned, are read-only snapshots of provider data, carry state the `decks` model has no place for (raw provider name, per-card match status, per-card verification tick, a verdict, a content hash), and must not appear in any user's deck list or consume the deck UUID/share-token space. We reuse the _rendering and validation_ (`CardCell`, deck-rules, deck-stat aggregates), not the _storage_.
- **Import mechanism: the provider pushes.** OpenRift exposes a generic ingest endpoint authenticated by a per-group key. OpenRift stores no provider credentials and runs no polling job. This matches "we provide a fitting API" and stays provider-agnostic.
- **Push scope: partial pushes with explicit withdrawal, into pre-created events.** Events are created in OpenRift and addressed by their id; a push can never create one, only fill it. A push upserts only the entries it lists; entries it does not mention are untouched, and withdrawal is an explicit per-entry flag. This is webhook-natural for providers that process submissions one at a time (the reference plugin does), and it makes an accidental single-entry push harmless instead of mass-withdrawing the event. The cost is that removals must be signaled actively; there is no self-healing full reconcile.
- **Re-import: invalidate the check.** When a re-pushed entry's normalized card list differs from the stored hash and the entry was already checked, it reverts to unchecked, per-card ticks clear, and the change is summarized for the judge to re-verify.

### Consequences

- Good, because judges, invites, and the join code come entirely from ADR-013; there is no second team/roster/invite system to build or maintain.
- Good, because the checker page reuses `CardCell`, the deck-rules validator, and the deck-stat aggregates with no fork of that code.
- Good, because dedicated tables keep entrant data fully isolated: none of the owner-exclusion filtering ADR-014 proposes (`excludeTournamentArchive()`) leaks into "my decks" or "public decks," and no anonymous route can ever reach an entrant list. The asymmetry with ADR-014 is deliberate: a missed filter on the public archive is cosmetic, a missed filter here would leak private competition data with player emails attached.
- Good, because the `judge` rank decouples "can check decks" from "can manage the group," so a six-judge team does not require six group admins.
- Bad, because adding a fourth role value touches every place that enumerates `FriendGroupRole` (the TS type in two files, the Zod enum, the CHECK constraint, the roster sort, the role-edit endpoint, the successor-promotion trigger, and the inline `admin`/`owner` checks in the friend-groups routes that do not go through `requireRole`). Mitigated by centralizing the rank order in one helper and auditing the call sites in the Confirmation section.
- Bad, because `judge` sits in a linear hierarchy, so every admin is implicitly also a judge and every judge implicitly has member-level group access. We accept this: a group admin checking decks is reasonable, and member-level access inside one's own group is harmless. If a group ever needs an admin who must not see entrant PII, that becomes a follow-up ADR that splits judging into an orthogonal capability.
- Bad, because a third concept now carries tournament semantics. Mitigated by naming the schema `deck_check_*` (never `tournament`) and keeping it off the `/tournaments` hub entirely; it lives under the group.

## Design Decisions

### Naming and relationship to the existing "tournament" concepts

There are already two: ADR-014's `tournaments` (the proposed public, admin-curated archive of notable decklists) and ADR-022's `pod_tournaments` (the implemented Swiss-style FFA pod runner). Both claim `/tournaments` as their home. To avoid a three-way collision, this subsystem uses the prefix `deck_check_*` in the schema and the word "deck check" in code. The user-facing label inside a group can read however the UI wants (an organizer thinks of it as their "tournament"), but the data model never reuses the `tournament` name and the feature never appears on the `/tournaments` hub. It is reached only through the owning group.

### Group-owned events and the `judge` role

A deck-check event belongs to exactly one friend group (`deck_check_events.group_id`). The judging team is the group's membership. ADR-013's role enum gains a fourth value, giving the rank order:

```
owner  >  admin  >  judge  >  member
```

`requireRole` (today a two-case check for `admin` / `owner`) is generalized to a single rank table so any minimum can be expressed:

```ts
const ROLE_RANK: Record<FriendGroupRole, number> = { member: 0, judge: 1, admin: 2, owner: 3 };
// passes when ROLE_RANK[membership.role] >= ROLE_RANK[minimum]
```

Permission matrix:

| Capability                                             | Minimum role           |
| ------------------------------------------------------ | ---------------------- |
| See the group's deck-check events                      | `judge`                |
| See an entry: player name, email, handle, the decklist | `judge`                |
| Tick cards, set the verdict, write notes, re-open      | `judge`                |
| Create / edit / archive events                         | `admin`                |
| Create / revoke push keys                              | `admin`                |
| Manage group members, roles, join code (unchanged)     | `admin` / `owner`      |
| Push entrants over the API (machine, not a member)     | a valid group push key |

A plain `member` sees no deck-check surface in the group at all, which is the PII boundary: entrant emails and lists are visible to `judge` and above only.

Role management on the existing role-edit endpoint: an `admin` can move members between `member` and `judge`, exactly as they manage `member` today; the existing rule that only the `owner` promotes or demotes an `admin` is unchanged.

The single-owner partial unique index and the successor-promotion trigger from ADR-013 are unchanged in intent. The successor ordering currently prefers an `admin`; it continues to fall back by `joined_at`, so a `judge` or `member` can inherit ownership only when no admin exists (acceptable; can be refined to prefer `judge` next).

### Push ingestion and per-group keys

An `admin` of a group mints a push key in the group's deck-check settings. The plaintext token is shown once; the database stores only its SHA-256 hash (`deck_check_keys.token_hash`). Authentication hashes the presented token and looks it up via the unique index; no timing-sensitive comparison is needed, because the stored value is a preimage-resistant hash rather than the secret itself. `token_prefix` keeps the first few characters of the plaintext purely so the settings UI can display "Key `orpk_a1b2…`". Keys are per group (the chosen scope): one key lets the organizer's system push entrants into any of the group's events, addressed by the event's id. Events themselves are created in OpenRift only; a push can never create one. Keys can be revoked and carry a `last_used_at` for visibility.

The ingest endpoint authenticates with `Authorization: Bearer <key>`, resolves the key to its group, and upserts within that group. There is no user session and no cookie; this is the only machine-to-machine surface in the subsystem, so it is explicitly bounded: the payload is validated with a Zod schema, at most 500 entries per push and 200 card lines per entry are accepted, the body is capped at 1 MB, and each key is rate-limited to 60 pushes per minute. A push targeting an `archived` event is rejected with 409: archived means the event is over, and a late push is almost certainly a misconfigured provider.

### Generic ingest contract

A push fills an existing event with entries; it never creates an event. The admin creates the event in OpenRift (name, date, format, allowed sets are OpenRift-owned metadata), copies its id from the event page, and configures the sending system with it. A push upserts the entries it lists; entries it does not mention are untouched. A provider can therefore push a single resubmission the moment it arrives, or the whole field at once; both are the same operation. The payload is deliberately neutral; the reference WordPress plugin maps its `pa_deck_cards` rows onto it, and any other organizer can do the same.

```jsonc
POST /api/v1/ingest/deck-check
Authorization: Bearer <group API key>

{
  "eventId": "<the event's id>",     // an existing event in the key's group; 404 otherwise
  "entries": [
    {
      "externalId": "1234",          // upsert key for the entry within the event
      "playerName": "A. Player",
      "playerEmail": "player@example.com",  // optional
      "riotId": "Player#EUW",                // optional; the player's Riot ID
      "submittedAt": "2026-06-18T20:00:00Z", // optional
      "publishOptOut": false,                 // optional consent passthrough
      "withdrawn": false,                     // optional; true soft-withdraws the entry
      "cards": [
        { "name": "Darius, Trifarian", "quantity": 1, "section": "champion" },
        { "name": "Blazing Scorcher", "quantity": 3, "section": "main" }
      ]
    }
  ]
}
```

Upsert semantics:

- The event must exist in the key's group; an unknown `eventId` is a 404 and nothing is imported. Entries upsert by `(event_id, externalId)`. Entries absent from a push are untouched.
- Withdrawal is explicit: `"withdrawn": true` sets `withdrawn_at` (soft, the check history is kept), and a later re-push of the entry without the flag clears it. There is no way to remove an event over the API; archiving or deleting an event is a UI action for an `admin`.
- `section` is the provider's own zone string; OpenRift maps it onto a `deck_zones` slug (`legend`, `champion`, `main`, `runes`, `battlefield`, ...) in the ingest layer, where the provider-to-OpenRift vocabulary mapping is the only provider-aware code. A deck-level concept like the reference plugin's "chosen champion" is the provider's mapping job too: it arrives as a card line with a `champion` section, not as a contract field.
- A `section` with no mapping to a `deck_zones` slug rejects the whole push with 422, naming the unknown sections; nothing is partially imported. The organizer fixes their mapping and re-pushes. This keeps `zone` strictly `NOT NULL`: a judge never sees a card in a guessed zone.
- Resubmission deadlines are the provider's concern. OpenRift accepts pushes until the event is archived.

### Card resolution and match status

Each card line stores the raw `name` exactly as received, plus the resolution result. Resolution is by normalized name against the catalog (cards plus name aliases); there is no per-line set code, since distinct Riftbound cards have distinct names and reprints share one card. If exactly one card matches, `matched`; if several do, `ambiguous`; if none, `unmatched`. Apostrophe and case normalization reuse the same normalization the deck codecs already apply. For a match, a canonical printing is chosen purely to source a thumbnail (`resolved_printing_id`); the art does not matter for a physical check, so no printing precision is attempted.

`unmatched` and `ambiguous` lines render as a flagged placeholder showing the raw name, so a judge is never tricked into ticking a card OpenRift could not identify. Card names are assumed to arrive as canonical English (as in the reference `card-library.json`); localized-name matching is out of scope.

Resolution happens at ingest, so an `unmatched` line stays unmatched even after the missing card is later added to the catalog, and with partial pushes a re-push may never come. The event page therefore offers a **re-resolve action** (`judge`+) that re-runs resolution for the event's `unmatched` and `ambiguous` lines. `matched` lines are left alone, and check state is untouched: the raw card list (and thus the `content_hash`) does not change, only its resolution does.

### Re-import and check invalidation

Every entry stores a `content_hash` over its normalized card lines (name, quantity, zone). On re-import:

- If the hash is unchanged, the check state is untouched (idempotent re-push).
- If the hash changed and the entry was `unchecked`, the cards are simply replaced.
- If the hash changed and the entry was `checked` or `issue`, the entry reverts to `unchecked`, `checked_by` / `checked_at` clear, all `deck_check_entry_cards.found_copies` ticks reset, and a `change_summary` (added / removed / changed lines, computed by diffing the old rows against the new before replacing them) is stored so the checker page can show "this list changed since it was checked." The summary clears on the next check.

This is the "a stale check never passes a changed deck" driver, realized.

### Per-card checking, verdict, and live multi-judge state

Verification has two levels. Per card line, `deck_check_entry_cards.found_copies` (a boolean array, one flag per physical copy) records which copy cells the judge has ticked; the checker renders one tappable cell per copy, because the deck on the table is unsorted and the judge encounters copies one at a time. Copies are physically interchangeable — the per-cell identity exists so the cell the judge taps is the one that lights up, including under polling and concurrent judges. Per entry, `check_status` is the verdict (`unchecked`, `checked`, `issue`) with `checked_by`, `checked_at`, and free-text `notes`. An already-checked entry can be re-opened by any judge.

Multiple judges share state through lightweight polling of the entry list and the open entry (writes apply immediately and optimistically; the poll reconciles). The list sorts unchecked first and shows live progress (X of Y checked) and who checked each entry and when. No pre-assignment: any judge takes any entry. Realtime transport (websockets) is deferred; polling is enough for a room of judges.

Judges can also repair an entry on site (`judge`+): edit the player's name, email, and handle, and add or remove card lines (a typical case: the player shows up with a corrected list agreed with the organizer). A card edit recomputes the entry's `content_hash` from the stored lines, so a later provider re-push of a now-different list still triggers the change-summary invalidation rather than silently passing.

Concurrency is last-write-wins at the entry level: two judges racing a verdict on the same entry is harmless, and the poll reconciles whoever lost. A per-card tick that targets a card row deleted in the meantime (a re-import replaces the rows wholesale) returns 409 and the client refetches the entry rather than failing opaquely.

### Validation and deck stats

Beyond the images, the checker page surfaces two reused computations:

- **Legality**, by building a deck-shaped structure from the resolved entry cards and running the existing `packages/shared` deck-rules for the event's `format`, plus an `allowedSets` check. Deck-size, exactly-one-legend, exactly-one-champion, and out-of-set cards show as warnings. Unmatched cards are called out as "cannot validate."
- **Deck stats** (domain / type / curve), reusing the same aggregate computation that powers the deck-list response, for at-a-glance context.

Neither blocks a check; both are advisory signals for the judge.

### PII handling

Player name, email, and handle are stored on the entry and shown to `judge` and above, which is what a judge needs to call the right person to the table. The provider's consent flags (`publishOptOut` and similar) are stored and honored for any non-judge surface. There is no non-judge surface in v1, so the flag is enforced defensively at the response mapper rather than relied on by a public route.

There is no automatic purge: entrant data lives until the organizer deletes the event or the group (both cascade). Retention is the organizer's responsibility as the data controller; OpenRift only mirrors what their system already stores, and deleting the event removes every entry and card line with it.

### User experience surfaces

All under the owning group (the chosen "in-group only" placement, no top-level shortcut):

- **`/groups/$slug/checks`** (`judge`+): the group's deck-check events, newest first. Each row shows name, date, format, entrant count, and checked-of-total progress.
- **`/groups/$slug/checks/$eventId`** (`judge`+): the entrant list. Player name, submitted time, status badge, who checked and when, a "changed since check" badge where relevant, search and an unchecked-first sort, live progress. Polls for shared state. Hosts the re-resolve action for unmatched and ambiguous lines.
- **`/groups/$slug/checks/$eventId/$entryId`** (`judge`+): the checker. Header with player name / email / handle and the verdict controls (mark checked, mark issue, notes, re-open); banners for legality warnings and unmatched cards; the deck-stat summary; cards grouped by zone via `CardCell`, rendered one cell per physical copy with a found-overlay tick, and unmatched lines as flagged placeholders.
- **Group deck-check settings** (`admin`+): mint and revoke push keys (plaintext shown once), view the external mapping, and a copy-paste payload snippet for the organizer to wire their system to the ingest endpoint.

The whole feature is gated behind a feature flag (registered in `KNOWN_FLAGS`), per the project's flag convention.

### Reversibility: a later merge into `decks` stays possible

Separate tables are not a one-way door. If entrant decks should ever surface in deck-centric features (a public tournament overview, decks claimable by player accounts, "decks featuring this card"), a migration into ADR-014's proposed shape (`decks` rows plus a satellite table) is a self-contained script, because the schema deliberately preserves everything such a migration needs:

- **Raw provider lines are kept verbatim** (`raw_name`, `section`). Resolution is a cache, not the record; lines that were `unmatched` at ingest time can be re-resolved against the then-current catalog at migration time.
- **Consent is captured from day one** (`publish_opt_out`), the one field that could never be reconstructed retroactively for a future public surface.
- **Zones and formats FK the same shared vocabularies** (`deck_zones`, `deck_formats`) that `decks` uses, so card lines translate 1:1 (`zone`, `quantity`, `resolved_card_id` → `card_id`, `resolved_printing_id` → `preferred_printing_id`).
- **Provenance is stable**: the entry `external_id` plus `submitted_at` keep the link to the organizer's system across any migration.
- **Player identity is stored as the claim keys** a future account link would match on (`player_email`, `riot_id`); linking is one additive nullable `claimed_user_id` column, never a rewrite.
- **Nothing references `deck_check_*` from outside**, so the migration has no fan-out.

The contract is additively extensible for the same futures: a post-event push with per-entry `placement` (standings do not exist anywhere today, because checks happen before the event concludes) is a backwards-compatible extension, listed under Deferred. Check-workflow state (ticks, verdicts, change summaries) would not migrate; it is operational tournament-day data, not deck data.

## Schema sketch

```sql
-- Extends ADR-013: friend_group_members.role gains 'judge'.
-- ALTER TABLE friend_group_members
--   DROP CONSTRAINT chk_friend_group_members_role,
--   ADD  CONSTRAINT chk_friend_group_members_role
--        CHECK (role = ANY (ARRAY['owner','admin','judge','member']));

CREATE TABLE deck_check_events (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  group_id     uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  event_date   date,
  format       text REFERENCES deck_formats(slug),
  allowed_sets jsonb,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status = ANY (ARRAY['active','archived'])),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deck_check_events_group ON deck_check_events (group_id);

CREATE TABLE deck_check_entries (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES deck_check_events(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  player_name    text NOT NULL CHECK (length(player_name) BETWEEN 1 AND 120),
  player_email   text CHECK (player_email IS NULL OR length(player_email) <= 254),
  riot_id        text CHECK (riot_id IS NULL OR length(riot_id) <= 120),
  submitted_at   timestamptz,
  publish_opt_out boolean NOT NULL DEFAULT false,
  content_hash   text NOT NULL,
  check_status   text NOT NULL DEFAULT 'unchecked'
                   CHECK (check_status = ANY (ARRAY['unchecked','checked','issue'])),
  checked_by     text REFERENCES users(id) ON DELETE SET NULL,
  checked_at     timestamptz,
  notes          text CHECK (notes IS NULL OR length(notes) <= 4000),
  change_summary jsonb,
  withdrawn_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, external_id)
);
CREATE INDEX idx_deck_check_entries_event ON deck_check_entries (event_id);

CREATE TABLE deck_check_entry_cards (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id            uuid NOT NULL REFERENCES deck_check_entries(id) ON DELETE CASCADE,
  sort_order          integer NOT NULL,
  raw_name            text NOT NULL,
  section             text NOT NULL,
  zone                text NOT NULL REFERENCES deck_zones(slug),
  quantity            integer NOT NULL CHECK (quantity > 0),
  resolved_card_id    uuid REFERENCES cards(id) ON DELETE SET NULL,
  resolved_printing_id uuid REFERENCES printings(id) ON DELETE SET NULL,
  match_status        text NOT NULL
                        CHECK (match_status = ANY (ARRAY['matched','ambiguous','unmatched'])),
  found_copies        boolean[] NOT NULL DEFAULT '{}' CHECK (cardinality(found_copies) <= quantity)
);
CREATE INDEX idx_deck_check_entry_cards_entry ON deck_check_entry_cards (entry_id);

CREATE TABLE deck_check_keys (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  group_id     uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE, -- SHA-256 of the plaintext token
  token_prefix text NOT NULL,        -- first chars of the plaintext, display only
  label        text,
  created_by   text REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX idx_deck_check_keys_group ON deck_check_keys (group_id);
```

## Will Not Be Built

- **Pull or scraping.** No scheduled fetch, no credentials stored for the provider, no scraper. Ingest is push-only.
- **Event creation by external systems.** Events (and their metadata: name, date, format, allowed sets) exist only through OpenRift; the ingest API can only fill them with entries.
- **Player accounts or a claim flow.** Entrants are free-text identity with no `users` link and no "this is me," the same stance as ADR-014.
- **A submission flow in OpenRift.** Players never enter lists here; lists arrive over the API. Judges can correct an entry on site (player details, card lines), but that is repair, not submission.
- **Public or anonymous visibility of entrant lists.** Decklists are private to the judging team. There is no share token and no SSR public route for an entry, unlike ADR-014's archive.
- **Running the tournament.** Pairings, rounds, and standings are ADR-022's pod runner. This feature only checks decks.
- **Trade or collection overlays on entrant decks.** No "do I own this" overlay (ADR-005), no trade integration (ADR-013 / ADR-019). The entrant deck belongs to a player, not the viewing judge.
- **Per-event judge subsets.** Judging is a group-level role in v1. A group whose membership is its judging team is the model.
- **PDF export of entrant decks.** The reference provider already produces PDFs (`decklist-pdf.php`); OpenRift does not duplicate that.

## Deferred / Out of Scope

- **Realtime transport.** Polling for v1; websockets only if a busy room shows it is needed.
- **Per-card discrepancy notes.** A line carries a found-copy count (so "found 2 of 3" is visible directly); anything richer (wrong printing, marked sleeves) goes in the entry-level notes.
- **Full audit history.** We keep the final verdict with who and when, not a log of every tick and re-open.
- **A back-channel to the provider.** Ingest is one-way; pushing check results back to the organizer's system is a later ADR.
- **Results / standings ingest.** The contract has no `placement` or finish field; checks happen before the event concludes, so the data does not exist at push time. A post-event push carrying standings is an additive, backwards-compatible contract extension for whenever an overview surface wants it.
- **Localized card-name matching.** English canonical names only.
- **Per-event or per-tournament key scoping.** Keys are per group.
- **Orthogonal judge capability.** If a group ever needs an admin who must not see entrant PII, splitting `judge` from the rank hierarchy is a follow-up, not v1.

## Confirmation

Schema and authorization invariants exercised by integration tests:

- `friend_group_members.role` accepts `judge`; the generalized `requireRole` enforces `owner > admin > judge > member`, so a `judge` passes a `judge` minimum and fails an `admin` minimum.
- A `member` receives 403 on every deck-check endpoint (list, entry, check, settings); a `judge` can read entries and submit checks but not create events or keys; only `admin`+ can create or edit events and mint or revoke keys.
- A push with a valid group key upserts entries by `(event_id, externalId)` into an existing event; an unknown `eventId` is rejected with 404 (pushes never create events); entries absent from a push are untouched; `"withdrawn": true` sets `withdrawn_at` rather than deleting, and a later re-push without the flag clears it.
- A push with an unknown `section` string is rejected with 422 naming the offending sections, and nothing from that push is imported; a push to an `archived` event is rejected with 409; a push over the limits (500 entries, 200 card lines per entry, 1 MB body) is rejected with 413/422.
- Re-pushing an entry with a changed card list resets a previously `checked` entry to `unchecked`, clears `checked_by` / `checked_at`, resets all `found_copies` ticks, and records a `change_summary`; an identical re-push leaves check state untouched.
- Card resolution tags `matched` / `ambiguous` / `unmatched` correctly against a seeded catalog fixture; unmatched and ambiguous lines never count toward a clean check and render as flagged placeholders.
- The re-resolve action upgrades a previously `unmatched` line to `matched` once the card exists in the catalog, without touching found-copy counts, check state, or the `content_hash`.
- A verdict write to an entry whose card rows were replaced by a re-import still applies (last-write-wins), but a per-card tick against a deleted card row returns 409.
- Legality validation flags an over-size or under-size deck, a missing or duplicate legend or champion, and an out-of-`allowedSets` card using the existing deck-rules.
- A revoked or unknown key returns 401; only the SHA-256 `token_hash` is persisted, never the plaintext token.
- Deleting a `deck_check_events` row cascades to its entries and entry cards; deleting the friend group cascades to its events and keys.
- `player_email` and `riot_id` appear only in `judge`+ responses; the response mapper drops them where `publish_opt_out` is set, even though no non-judge surface consumes them in v1.

## More Information

Relationship to other ADRs:

- **ADR-013 (Friend Groups).** This ADR extends ADR-013 by adding the `judge` role to the friend-group hierarchy and by introducing a new group-owned resource type. It reuses ADR-013's membership, invites, join code, and the single-owner invariant. ADR-013's three-value role enum is superseded by the four-value enum here.
- **ADR-014 (Tournament Decks Archive).** A different concept: ADR-014 (itself still proposed, not yet implemented; neither its tables nor its synthetic owner exist in the schema today) describes a public, admin-curated, anonymously browsable archive that would reuse `decks` with a synthetic owner. This feature is private, push-fed, group-owned, and uses dedicated tables. No foreign keys connect the two. Both deliberately use free-text player identity with no `users` link, which keeps a later convergence possible (see Reversibility above).
- **ADR-022 (FFA Pod Pairing).** A different concept again (the pod runner under `/tournaments/run/`). No foreign keys, no shared tables. The only relationship is that all three concepts carry tournament semantics, which is why this one is named `deck_check_*` and stays off the `/tournaments` hub.
- **ADR-005 (Collection Tracking).** Explicitly not used here: there is no "can I build this" overlay, because an entrant deck belongs to a player, not to the judge viewing it.
