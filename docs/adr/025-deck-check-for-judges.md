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
- **Entrants are not OpenRift users.** Players submit a name, an email, and a list. They do not have OpenRift accounts and never log in. Only judges do. The model must hold free-text player identity, never a `users` row, mirroring the stance ADR-014 took for archived pilots.
- **Decklist secrecy.** Entrant lists are private competition data before and during an event. Unlike ADR-014's public archive, these are never anonymously visible; access is restricted to the judging team.
- **Shared live state for many judges.** Multiple judges work one event at once, pick whoever is next in line (no pre-assignment), must not redo each other's work, and can re-open a check to fix a mistake.
- **A stale check must never pass a changed deck.** Players may re-submit up to a deadline. When a list changes after it was checked, the check has to be invalidated, not silently kept.
- **Reuse the existing collaboration and rendering plumbing.** Friend-group membership, invites, and join codes already model "a team of people," and `CardCell` plus the deck-rules and deck-stat code already render and validate decks. Build on them rather than re-deriving them.
- **Do not overload the two existing "tournament" concepts.** ADR-014 (`tournaments`, public curated deck archive) and ADR-022 (`pod_tournaments`, the FFA pod runner) both already exist and share the `/tournaments` hub. A third concept needs a name and a home that do not collide with either.

## Considered Options

Five independent axes, each with the option chosen below.

1. **Access and ownership:** a dedicated per-tournament judge roster with its own invite/code; reuse friend groups; or global admins only.
2. **Judge permission model:** add a `judge` value to the friend-group role hierarchy; add an orthogonal `can_judge` capability flag decoupled from rank; or assign judges per event in a join table.
3. **Entry storage:** reuse the `decks` / `deck_cards` schema with a synthetic owner (as ADR-014 did); or dedicated `deck_check_*` tables.
4. **Import mechanism:** the provider pushes to an OpenRift ingest endpoint; OpenRift pulls from the provider on a schedule; or manual sync only.
5. **Re-import of an already-checked deck:** invalidate the check; keep the verdict but flag it stale; or lock the entry/tournament after the first check.

## Decision Outcome

- **Access and ownership: reuse friend groups.** A deck-check event is a group-owned resource. Judges are group members. This reuses ADR-013's membership, invites, join code, and group-owned-resource pattern (already used by `collections.group_id`) instead of building a parallel roster and invite system. An external organizer creates a group, adds their judges, and runs their events inside it.
- **Judge permission model: a new `judge` role in the friend-group hierarchy,** ranked `owner > admin > judge > member`. Judging requires rank `>= judge`; managing events and push keys requires rank `>= admin`; plain `member` gets no deck-check access at all. This keeps the codebase's single-role model, lets the organizer grant judging without granting full group-admin powers, and preserves a clean PII boundary (only `judge` and above see entrant decks and emails).
- **Entry storage: dedicated `deck_check_*` tables,** unlike ADR-014. Entrants are not user-owned, are read-only snapshots of provider data, carry state the `decks` model has no place for (raw provider name plus set, per-card match status, per-card verification tick, a verdict, a content hash), and must not appear in any user's deck list or consume the deck UUID/share-token space. We reuse the _rendering and validation_ (`CardCell`, deck-rules, deck-stat aggregates), not the _storage_.
- **Import mechanism: the provider pushes.** OpenRift exposes a generic ingest endpoint authenticated by a per-group key. OpenRift stores no provider credentials and runs no polling job. This matches "we provide a fitting API" and stays provider-agnostic.
- **Re-import: invalidate the check.** When a re-pushed entry's normalized card list differs from the stored hash and the entry was already checked, it reverts to unchecked, per-card ticks clear, and the change is summarized for the judge to re-verify.

### Consequences

- Good, because judges, invites, and the join code come entirely from ADR-013; there is no second team/roster/invite system to build or maintain.
- Good, because the checker page reuses `CardCell`, the deck-rules validator, and the deck-stat aggregates with no fork of that code.
- Good, because dedicated tables keep entrant data fully isolated: no `excludeTournamentArchive()`-style filtering leaks into "my decks" or "public decks," and no anonymous route can ever reach an entrant list.
- Good, because the `judge` rank decouples "can check decks" from "can manage the group," so a six-judge team does not require six group admins.
- Bad, because adding a fourth role value touches every place that enumerates `FriendGroupRole` (the TS type in two files, the Zod enum, the CHECK constraint, the roster sort, the role-edit endpoint, the successor-promotion trigger). Mitigated by centralizing the rank order in one helper and auditing the call sites in the Confirmation section.
- Bad, because `judge` sits in a linear hierarchy, so every admin is implicitly also a judge and every judge implicitly has member-level group access. We accept this: a group admin checking decks is reasonable, and member-level access inside one's own group is harmless. If a group ever needs an admin who must not see entrant PII, that becomes a follow-up ADR that splits judging into an orthogonal capability.
- Bad, because a third concept now carries tournament semantics. Mitigated by naming the schema `deck_check_*` (never `tournament`) and keeping it off the `/tournaments` hub entirely; it lives under the group.

## Design Decisions

### Naming and relationship to the existing "tournament" concepts

There are already two: ADR-014's `tournaments` (a public, admin-curated archive of notable decklists) and ADR-022's `pod_tournaments` (the Swiss-style FFA pod runner). Both live under `/tournaments`. To avoid a three-way collision, this subsystem uses the prefix `deck_check_*` in the schema and the word "deck check" in code. The user-facing label inside a group can read however the UI wants (an organizer thinks of it as their "tournament"), but the data model never reuses the `tournament` name and the feature never appears on the `/tournaments` hub. It is reached only through the owning group.

### Group-owned events and the `judge` role

A deck-check event belongs to exactly one friend group (`deck_check_events.group_id`). The judging team is the group's membership. ADR-013's role enum gains a fourth value, giving the rank order:

```
owner  >  admin  >  judge  >  member
```

`requireRole` (today a two-case check for `admin` / `owner`) is generalized to a single rank table so any minimum can be expressed:

```ts
const ROLE_RANK: Record<FriendGroupRole, number> = { owner: 0, admin: 1, judge: 2, member: 3 };
// passes when ROLE_RANK[membership.role] <= ROLE_RANK[minimum]
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

The single-owner partial unique index and the successor-promotion trigger from ADR-013 are unchanged in intent. The successor ordering currently prefers an `admin`; it continues to fall back by `joined_at`, so a `judge` or `member` can inherit ownership only when no admin exists (acceptable; can be refined to prefer `judge` next).

### Push ingestion and per-group keys

An `admin` of a group mints a push key in the group's deck-check settings. The plaintext token is shown once; only a hash is stored (`deck_check_keys.token_hash`, looked up with a constant-time compare). Keys are per group (the chosen scope): one key lets the organizer's system create and update any event in that group, keyed by the event's external id. Keys can be revoked and carry a `last_used_at` for visibility.

The ingest endpoint authenticates with `Authorization: Bearer <key>`, resolves the key to its group, and upserts within that group. There is no user session and no cookie; this is the only machine-to-machine surface in the subsystem.

### Generic ingest contract

One push is the authoritative snapshot of one event's entrants. The payload is deliberately neutral; the reference WordPress plugin maps its `pa_decks` / `pa_deck_cards` rows onto it, and any other organizer can do the same.

```jsonc
POST /api/v1/ingest/deck-check
Authorization: Bearer <group push key>

{
  "externalId": "spring-cup-2026",   // upsert key for the event within the group
  "name": "Spring Cup 2026",
  "date": "2026-06-20",              // optional
  "format": "constructed",          // optional, maps to deck_formats.slug for legality
  "allowedSets": ["OGN", "OGS"],    // optional, for set-legality flagging; omit for any
  "entries": [
    {
      "externalId": "1234",          // upsert key for the entry within the event
      "playerName": "A. Player",
      "playerEmail": "player@example.com",  // optional
      "playerHandle": "Player#EUW",          // optional (e.g. Riot ID)
      "submittedAt": "2026-06-18T20:00:00Z", // optional
      "publishOptOut": false,                 // optional consent passthrough
      "cards": [
        { "name": "Darius, Trifarian", "set": "OGN", "quantity": 1, "section": "champion" },
        { "name": "Blazing Scorcher",  "set": "OGN", "quantity": 3, "section": "main" }
      ]
    }
  ]
}
```

Upsert semantics:

- Events upsert by `(group_id, externalId)`; entries upsert by `(event_id, externalId)`.
- An entry present in OpenRift but absent from a later snapshot is soft-withdrawn (`withdrawn_at` set), not deleted, so a check history is not lost if a player is removed and re-added.
- `section` is the provider's own zone string; OpenRift maps it onto a `deck_zones` slug (`legend`, `champion`, `main`, `runes`, `battlefield`, ...) in the ingest layer, where the provider-to-OpenRift vocabulary mapping is the only provider-aware code.

### Card resolution and match status

Each card line stores the raw `name` and `set` exactly as received, plus the resolution result. Resolution: try exact name plus set against the catalog; fall back to name-only across sets. If exactly one card matches, `matched`; if several do, `ambiguous`; if none, `unmatched`. Apostrophe and case normalization reuse the same normalization the deck codecs already apply. For a match, a canonical printing is chosen purely to source a thumbnail (`resolved_printing_id`); the art does not matter for a physical check, so no printing precision is attempted.

`unmatched` and `ambiguous` lines render as a flagged placeholder showing the raw name and set, so a judge is never tricked into ticking a card OpenRift could not identify. Card names are assumed to arrive as canonical English (as in the reference `card-library.json`); localized-name matching is out of scope.

### Re-import and check invalidation

Every entry stores a `content_hash` over its normalized card lines (name, set, quantity, zone). On re-import:

- If the hash is unchanged, the check state is untouched (idempotent re-push).
- If the hash changed and the entry was `unchecked`, the cards are simply replaced.
- If the hash changed and the entry was `checked` or `issue`, the entry reverts to `unchecked`, `checked_by` / `checked_at` clear, all `deck_check_entry_cards.verified` reset to false, and a `change_summary` (added / removed / changed lines, computed by diffing the old rows against the new before replacing them) is stored so the checker page can show "this list changed since it was checked." The summary clears on the next check.

This is the "a stale check never passes a changed deck" driver, realized.

### Per-card checking, verdict, and live multi-judge state

Verification has two levels. Per card, `deck_check_entry_cards.verified` is a tick the judge toggles as they find each card in the physical deck (quantity shown alongside). Per entry, `check_status` is the verdict (`unchecked`, `checked`, `issue`) with `checked_by`, `checked_at`, and free-text `notes`. A "mark all verified" shortcut sets every tick at once for a clean deck. An already-checked entry can be re-opened by any judge.

Multiple judges share state through lightweight polling of the entry list and the open entry (writes apply immediately and optimistically; the poll reconciles). The list sorts unchecked first and shows live progress (X of Y checked) and who checked each entry and when. No pre-assignment: any judge takes any entry. Realtime transport (websockets) is deferred; polling is enough for a room of judges.

### Validation and deck stats

Beyond the images, the checker page surfaces two reused computations:

- **Legality**, by building a deck-shaped structure from the resolved entry cards and running the existing `packages/shared` deck-rules for the event's `format`, plus an `allowedSets` check. Deck-size, exactly-one-legend, exactly-one-champion, and out-of-set cards show as warnings. Unmatched cards are called out as "cannot validate."
- **Deck stats** (domain / type / curve), reusing the same aggregate computation that powers the deck-list response, for at-a-glance context.

Neither blocks a check; both are advisory signals for the judge.

### PII handling

Player name, email, and handle are stored on the entry and shown to `judge` and above, which is what a judge needs to call the right person to the table. The provider's consent flags (`publishOptOut` and similar) are stored and honored for any non-judge surface. There is no non-judge surface in v1, so the flag is enforced defensively at the response mapper rather than relied on by a public route.

### User experience surfaces

All under the owning group (the chosen "in-group only" placement, no top-level shortcut):

- **`/groups/$slug/checks`** (`judge`+): the group's deck-check events, newest first. Each row shows name, date, format, entrant count, and checked-of-total progress.
- **`/groups/$slug/checks/$eventId`** (`judge`+): the entrant list. Player name, submitted time, status badge, who checked and when, a "changed since check" badge where relevant, search and an unchecked-first sort, live progress. Polls for shared state.
- **`/groups/$slug/checks/$eventId/$entryId`** (`judge`+): the checker. Header with player name / email / handle and the verdict controls (mark checked, mark issue, notes, re-open); banners for legality warnings and unmatched cards; the deck-stat summary; cards grouped by zone via `CardCell`, each line a tappable verification tick with its quantity, and unmatched lines as flagged placeholders; a "mark all verified" shortcut.
- **Group deck-check settings** (`admin`+): mint and revoke push keys (plaintext shown once), view the external mapping, and a copy-paste payload snippet for the organizer to wire their system to the ingest endpoint.

The whole feature is gated behind a feature flag (registered in `KNOWN_FLAGS`), per the project's flag convention.

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
  external_id  text NOT NULL,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  event_date   date,
  format       text REFERENCES deck_formats(slug),
  allowed_sets jsonb,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status = ANY (ARRAY['active','archived'])),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, external_id)
);
CREATE INDEX idx_deck_check_events_group ON deck_check_events (group_id);

CREATE TABLE deck_check_entries (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES deck_check_events(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  player_name    text NOT NULL CHECK (length(player_name) BETWEEN 1 AND 120),
  player_email   text,
  player_handle  text,
  submitted_at   timestamptz,
  publish_opt_out boolean NOT NULL DEFAULT false,
  content_hash   text NOT NULL,
  check_status   text NOT NULL DEFAULT 'unchecked'
                   CHECK (check_status = ANY (ARRAY['unchecked','checked','issue'])),
  checked_by     text REFERENCES users(id),
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
  raw_set             text,
  section             text NOT NULL,
  zone                text NOT NULL REFERENCES deck_zones(slug),
  quantity            integer NOT NULL CHECK (quantity > 0),
  resolved_card_id    uuid REFERENCES cards(id),
  resolved_printing_id uuid REFERENCES printings(id) ON DELETE SET NULL,
  match_status        text NOT NULL
                        CHECK (match_status = ANY (ARRAY['matched','ambiguous','unmatched'])),
  verified            boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_deck_check_entry_cards_entry ON deck_check_entry_cards (entry_id);

CREATE TABLE deck_check_keys (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  group_id     uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  label        text,
  created_by   text NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX idx_deck_check_keys_group ON deck_check_keys (group_id);
```

## Will Not Be Built

- **Pull or scraping.** No scheduled fetch, no credentials stored for the provider, no scraper. Ingest is push-only.
- **Player accounts or a claim flow.** Entrants are free-text identity with no `users` link and no "this is me," the same stance as ADR-014.
- **Editing entrant decks in OpenRift.** Entries are read-only snapshots. The organizer's system is the source of truth; corrections flow through a re-push.
- **Public or anonymous visibility of entrant lists.** Decklists are private to the judging team. There is no share token and no SSR public route for an entry, unlike ADR-014's archive.
- **Running the tournament.** Pairings, rounds, and standings are ADR-022's pod runner. This feature only checks decks.
- **Trade or collection overlays on entrant decks.** No "do I own this" overlay (ADR-005), no trade integration (ADR-013 / ADR-019). The entrant deck belongs to a player, not the viewing judge.
- **Per-event judge subsets.** Judging is a group-level role in v1. A group whose membership is its judging team is the model.
- **PDF export of entrant decks.** The reference provider already produces PDFs (`decklist-pdf.php`); OpenRift does not duplicate that.

## Deferred / Out of Scope

- **Realtime transport.** Polling for v1; websockets only if a busy room shows it is needed.
- **Per-card discrepancy detail.** A line is a single verify tick plus the entry-level notes; "found 2 of 3" granularity is deferred to notes.
- **Full audit history.** We keep the final verdict with who and when, not a log of every tick and re-open.
- **A back-channel to the provider.** Ingest is one-way; pushing check results back to the organizer's system is a later ADR.
- **Localized card-name matching.** English canonical names only.
- **Per-event or per-tournament key scoping.** Keys are per group.
- **Orthogonal judge capability.** If a group ever needs an admin who must not see entrant PII, splitting `judge` from the rank hierarchy is a follow-up, not v1.

## Confirmation

Schema and authorization invariants exercised by integration tests:

- `friend_group_members.role` accepts `judge`; the generalized `requireRole` enforces `owner > admin > judge > member`, so a `judge` passes a `judge` minimum and fails an `admin` minimum.
- A `member` receives 403 on every deck-check endpoint (list, entry, check, settings); a `judge` can read entries and submit checks but not create events or keys; only `admin`+ can create or edit events and mint or revoke keys.
- A push with a valid group key upserts the event by `(group_id, externalId)` and entries by `(event_id, externalId)`; an entry missing from a later snapshot gets `withdrawn_at` set rather than being deleted.
- Re-pushing an entry with a changed card list resets a previously `checked` entry to `unchecked`, clears `checked_by` / `checked_at`, resets all `verified` flags, and records a `change_summary`; an identical re-push leaves check state untouched.
- Card resolution tags `matched` / `ambiguous` / `unmatched` correctly against a seeded catalog fixture; unmatched and ambiguous lines never count toward a clean check and render as flagged placeholders.
- Legality validation flags an over-size or under-size deck, a missing or duplicate legend or champion, and an out-of-`allowedSets` card using the existing deck-rules.
- A revoked or unknown key returns 401; key lookup compares `token_hash` in constant time.
- Deleting a `deck_check_events` row cascades to its entries and entry cards; deleting the friend group cascades to its events and keys.
- `player_email` and `player_handle` appear only in `judge`+ responses; the response mapper drops them where `publish_opt_out` is set, even though no non-judge surface consumes them in v1.

## More Information

Relationship to other ADRs:

- **ADR-013 (Friend Groups).** This ADR extends ADR-013 by adding the `judge` role to the friend-group hierarchy and by introducing a new group-owned resource type. It reuses ADR-013's membership, invites, join code, and the single-owner invariant. ADR-013's three-value role enum is superseded by the four-value enum here.
- **ADR-014 (Tournament Decks Archive).** A different concept: ADR-014 is a public, admin-curated, anonymously browsable archive that reuses `decks` with a synthetic owner. This feature is private, push-fed, group-owned, and uses dedicated tables. No foreign keys connect the two. Both deliberately use free-text player identity with no `users` link.
- **ADR-022 (FFA Pod Pairing).** A different concept again (the pod runner under `/tournaments/run/`). No foreign keys, no shared tables. The only relationship is that all three concepts carry tournament semantics, which is why this one is named `deck_check_*` and stays off the `/tournaments` hub.
- **ADR-005 (Collection Tracking).** Explicitly not used here: there is no "can I build this" overlay, because an entrant deck belongs to a player, not to the judge viewing it.
