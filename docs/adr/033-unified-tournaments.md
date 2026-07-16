---
status: accepted
date: 2026-06-27
---

# ADR-033: Unified Tournaments: Hosts, Participants, and Capability Modules

## Context and Problem Statement

OpenRift grew three tournament-shaped features independently, and they no longer match how real events work:

- **The pod runner (ADR-022, `pod_tournaments`).** A free-for-all pod-pairing engine. It owns rounds, pods, results, and standings, but the players are anonymous free-text names (`pod_players` has no `user_id`), there is no deck submission, no judges, no group association, and the only host is a single OpenRift account.
- **Deck check (ADR-025 / 026 / 027, `deck_check_*`).** A judge-facing deck-submission and verification flow. It owns rich participant identity (name, email, Riot id, a claim/link machinery to an account), submission deadlines, and entry states, but it has no competition at all (no pairings, rounds, or standings), and `deck_check_events.group_id NOT NULL` hard-binds every event to a friend group.
- **The decks archive (ADR-014, `tournaments` / `tournaments_decks`).** A separate, admin-curated, public read-only archive of other people's decklists for meta research. It is proposed but never built: there are no such tables in `docs/schema.sql`.

A real tournament cuts across these boxes. From the product owner:

- A tournament has a format (Swiss, Swiss + Top-N cut) and a pairing style (1v1, or 3/4-player pods).
- A tournament is held by a person or an event organization (a local game store, a league).
- Its participants are sometimes mostly an OpenRift friend group, and sometimes not.
- Some tournaments require players to hand in decks beforehand.
- Some tournaments have judges.
- Some tournaments need the deck-check verification flow.

Today every one of those is an either/or baked into which product you picked: the pod runner can pair but can't take decks or have judges; deck check can take decks and have judges but can't pair; neither can be hosted by an organization; and the two model the same human two incompatible ways. The question this ADR answers: what is the umbrella data model and UI that lets one tournament compose any subset of {a pairing engine, deck submission, deck check, judges} under either a personal or an organizational host, optionally linked to a friend group, and how do we get there from the current split without a rewrite?

This ADR was scoped in a question-driven design session with the product owner (2026-06-27). The decisions it records are the result of that session; the "Resolved design decisions" section below is the authoritative list. Headline scope: all four migration phases will be built. Organizations are first-class but admin-provisioned. The pairing engine stays pods-only (Swiss / cut / 1v1 are designed-for, not built here). Existing data must be preserved losslessly by every migration.

> **Amended 2026-07-16 ([ADR-041](041-swiss-pairing-and-regions.md)).** The pairing engine now also runs Swiss 1v1: `pairing_style` gained `swiss` and matches are pods of size 2 on the same machinery, exactly through the seam this ADR left open.

## Decision Drivers

- **One tournament, optional capabilities.** Format, pairing, deck submission, deck check, judges, and group linkage must be composable toggles on a single entity, not a fork in the product. A casual pod night and a judged store Swiss-with-cut are the same row with different modules on.
- **Hosts are users _or_ organizations.** "Held by a person or a local game store" is an explicit requirement. Ownership cannot stay `owner_user_id`-only (pod runner) or `group_id`-only (deck check). An organization is a first-class host that carries staff across many tournaments.
- **A group is an association, not ownership.** `deck_check_events.group_id NOT NULL` is wrong: an LGS event with walk-ins is not a friend group. Linking a tournament to a group is an optional convenience (visibility), never the thing that owns it.
- **One participant identity that spans walk-in → claimed → account.** The hard merge. `pod_players` (anonymous) and `deck_check_entries` (email + claim flow) are the same person modeled twice. The unified participant must hold a bare name, an email for invite/claim, and an optional linked `user_id`, with the deck-check claim machinery lifted onto it.
- **Judges decouple from group roles.** Today "judge" is a friend-group role, so a person-hosted tournament with no group cannot have judges. Tournament staff must be grantable per tournament independent of any group.
- **Keep the proven pod engine intact.** ADR-022's pure local-search pairer in `packages/shared/src/pairing/` and its lean derive-on-read model are good and stay. This redesign does not touch the pairing math. It re-parents the pod machinery under the umbrella and leaves a seam for future formats.
- **Reuse the established server-feature wiring.** Migrations in the barrel, repository factories on the Hono context, zod schemas in `packages/shared`, server functions + suspense queries in web, nullable share/report tokens. No new architectural patterns.
- **Phase it; never a flag-day rewrite.** Each phase ships independently, migrates live data losslessly, and leaves the app working. Ownership first (low risk), participant unification next (the crux), deck-check absorption last.
- **Claim the `tournaments` name.** The ADR-014 archive that reserved it was never built. The umbrella is the rightful `tournaments`. ADR-014, if ever built, picks a different name.

## Decision Outcome

We build a single `tournaments` umbrella entity hosted by either a user or a first-class, admin-provisioned `organization`, optionally associated with a friend group, carrying per-tournament `tournament_staff` (organizer / judge / scorekeeper). The existing ADR-022 pod machinery is re-parented underneath as the pairing module and the ADR-025/026/027 deck-check flow as the deck-submission + verification module, both keyed on a unified `tournament_participants` identity. Capabilities are columns and child rows toggled per tournament, not separate products. The pairing engine itself is unchanged (pods only). The `format` / `pairing_style` columns (including a `'none'` value for deck-check-only events) and the `pod_rounds`/`pods` seam leave room so Swiss / Top-cut / 1v1 can be added later as additional formats without another structural migration.

## Resolved design decisions

These are the authoritative decisions from the 2026-06-27 design session. The schema and phasing sections below realize them.

1. **Build scope: all four phases.** Hosts/staff, participant unification, deck-check absorption, and organization surfaces. Not just a foundation.
2. **Data preservation: lossless, reversible migrations.** Real pod tournaments and deck-check events exist. Every phase backfills live rows without loss and is reversible before the next phase lands.
3. **One `tournaments` table; `'none'` pairing for deck-check-only events.** A deck-check-only event is a tournament with `format='none'` / `pairing_style='none'`. Its Pairings/Standings tabs are hidden.
4. **Organizations are admin-provisioned.** Any user can _host_ a tournament directly. An _organization_ is created by OpenRift admins on request (prevents impersonation of real stores).
5. **Host model: polymorphic.** `host_type ∈ {user, organization}` with exactly one of `host_user_id` / `host_org_id`, enforced by a CHECK.
6. **Org members inherit authority.** An organization's `owner` / `manager` is implicitly an `organizer` on every tournament the org hosts. `tournament_staff` is only for adding outside judges/scorekeepers.
7. **One participant per linked account.** `UNIQUE (tournament_id, user_id) WHERE user_id IS NOT NULL`. Walk-in names (null `user_id`) are unlimited. Linking is how "this is me" / claim works and de-dupes a person.
8. **Group link does visibility only** (this build). Group members can see a linked tournament and its standings. One-click roster import from group membership is deferred.
9. **Deck submission always produces a full deck-check entry** (resolved cards, lines). `deck_check_enabled` only toggles whether judges review it. `deck_submission ∈ {none, optional, required}` governs whether a list is expected.
10. **Separate deck phase.** A deck-submission sub-state (`open → closed → locked`, driven by `submissions_close_at` + `list_lock_mode`) runs orthogonally to `status` (`setup/running/completed/cancelled`), so "decks handed in before the tournament starts" is representable and a no-pairing event lives entirely in the deck phase.
11. **Three separate tokens.** `report_token` (spectator follow-along + pod result entry), `submission_token` (open self-submission link), and per-participant `claim_token`. Distinct audiences, distinct lifecycles.
12. **Visibility: private + token links.** In-app the tournament is visible to host, staff, participants, and (if linked) group members. Spectators reach it through `report_token`. Pages are `noIndex`. No public listing or SEO surface.
13. **Clean `/tournaments/*` URLs, no redirects.** Drop the `/tournaments/run` segment and the top-level `/tournament-*` routes. Old URLs are allowed to 404.
14. **UI term: "Organization."**
15. **Minimal organization fields** now: `id`, `slug`, `name`, `description`, `owner_user_id`, timestamps. Branding (logo/website/location) deferred to when org pages need it.
16. **Integration keys re-parented to the host.** `deck_check_keys` move from `group_id` to the host (user or org) so external/automated deck submission keeps working across that host's tournaments.
17. **No separate archived state.** `completed` covers it. Existing archived deck-check events migrate to `completed`. `cancelled` is a host action that locks the tournament read-only.
18. **Approval gate for self-service only.** Provider pushes (API key), judge/host adds, and email invites are auto-active (trusted). A stranger adding themselves via a shared link lands as `requested` and the host approves.
19. **Self-submission via the open link creates a pending participant carrying the deck.** A `requested` participant plus its deck entry. The host approves to admit both into the roster and the deck-check queue, or denies to discard.
20. **Retire the friend-group `judge` role.** Migrate existing group judges to `tournament_staff(judge)` on the group's migrated tournaments, then drop `judge` from the `friend_group_members` role enum (`owner > admin > member`). Judging lives only at the tournament level.
21. **Ingest contract field renamed to `tournamentId`.** Clean break. Old `eventId` pushes 422 until the provider reconfigures (the migrated event's uuid is reused as the tournament id, so only the field name changes).

## Considered Options

The session settled each axis above. The main rejected alternatives, for the record:

- **Umbrella vs. cross-linked products.** Rejected keeping three products with FK cross-links (cements the split, doubles every "is this tournament X?" query, no home for orgs/judges). Rejected a generic polymorphic "event" supertype (over-abstracted for the size).
- **Host model.** Rejected forcing every tournament under an auto-created "personal organization" (ceremony for the one-person pod night). Rejected keeping `owner_user_id` and bolting org on later (retrofitting after participants/modules build on it is the more expensive order).
- **Participant identity.** Rejected keeping `pod_players` and `deck_check_entries` separate and joining on a fuzzy name/email match (that is today's bug). Rejected requiring every participant to be a real account (walk-ins are the norm).
- **Deck-check "event".** Rejected keeping `deck_check_events` as a child of a tournament (no real tournament needs multiple deck-check events; one decklist-per-participant is the model). Left as a future option for multi-stage events.
- **Lifecycle.** Rejected a single `status` field (conflates the deadline clock with pairing progress; the deck-handin case forces an extra flag back in, which is the deck phase by another name).
- **Tokens.** Rejected one scoped share link (a leaked spectator link would expose deck submission/claim; one token can't hold three lifecycles).
- **Approval.** Rejected approving everyone (a store's bulk-pushed field would need clearing) and keeping today's link-is-approval model (anyone with the link is in your standings).

### Target schema (the destination)

This is the end state. The phasing section sequences how we reach it from `pod_tournaments` + `deck_check_*` losslessly. Existing pod child tables (`pod_rounds`, `pods`, `pod_members`, `pod_byes`) keep their shape. Only their parent FKs change.

```sql
-- Event organizations (LGS, leagues). Admin-provisioned; a first-class host.
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description   text CHECK (description IS NULL OR length(description) <= 4000),
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('owner', 'manager')),  -- both inherit organizer authority
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- The umbrella. Today's pod_tournaments, renamed and extended.
CREATE TABLE tournaments (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),

  -- Host: exactly one of user / organization.
  host_type      text NOT NULL CHECK (host_type IN ('user', 'organization')),
  host_user_id   text REFERENCES users(id) ON DELETE CASCADE,
  host_org_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT chk_tournaments_host CHECK (
    (host_type = 'user'         AND host_user_id IS NOT NULL AND host_org_id IS NULL) OR
    (host_type = 'organization' AND host_org_id  IS NOT NULL AND host_user_id IS NULL)
  ),

  -- Optional friend-group association (visibility only; NOT ownership).
  group_id       uuid REFERENCES friend_groups(id) ON DELETE SET NULL,

  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status         text NOT NULL DEFAULT 'setup'
                   CHECK (status IN ('setup', 'running', 'completed', 'cancelled')),
  starts_at      timestamptz,            -- optional scheduled start

  -- Format + pairing. 'none' = deck-check-only (no rounds). v1 ships only these
  -- values; the columns exist so Swiss / cut / 1v1 are additive later.
  format         text NOT NULL DEFAULT 'pod_rounds'
                   CHECK (format IN ('none', 'pod_rounds')),       -- future: 'swiss', 'swiss_top_cut'
  pairing_style  text NOT NULL DEFAULT 'pod'
                   CHECK (pairing_style IN ('none', 'pod')),       -- future: 'versus'
  CONSTRAINT chk_tournaments_format_pairing CHECK (
    (format = 'none'       AND pairing_style = 'none') OR
    (format = 'pod_rounds' AND pairing_style = 'pod')
  ),
  current_round  integer NOT NULL DEFAULT 0,
  scoring_scheme text NOT NULL DEFAULT 'standard'
                   CHECK (scoring_scheme IN ('standard', 'three_pod_reduced')),
  bye_points     integer NOT NULL DEFAULT 3 CHECK (bye_points >= 0),

  -- Module: deck submission (always produces a full deck-check entry).
  deck_submission   text NOT NULL DEFAULT 'none'
                      CHECK (deck_submission IN ('none', 'optional', 'required')),
  deck_check_enabled boolean NOT NULL DEFAULT false,         -- judges verify submitted decks
  CONSTRAINT chk_tournaments_deck_check CHECK (
    NOT deck_check_enabled OR deck_submission <> 'none'      -- can't check decks nobody submits
  ),
  CONSTRAINT chk_tournaments_nonempty CHECK (
    format <> 'none' OR deck_submission <> 'none'            -- a 'none' tournament must at least take decks
  ),

  -- Deck phase (orthogonal to status). Drives submissions, not pairing.
  deck_phase     text NOT NULL DEFAULT 'open'
                   CHECK (deck_phase IN ('open', 'closed', 'locked')),
  submissions_close_at timestamptz,
  list_lock_mode text NOT NULL DEFAULT 'on_submit'
                   CHECK (list_lock_mode IN ('on_submit', 'at_deadline')),
  deck_format    text REFERENCES deck_formats(slug),         -- deck-legality format (NOT the pairing `format`)
  allowed_sets   jsonb,
  self_registration boolean NOT NULL DEFAULT false,          -- open the request-to-join link

  -- Tokens (three distinct capabilities).
  report_token     text,                 -- pod follow-along + result entry (ADR-022); pairing formats only
  submission_token text,                 -- open self-submission / registration link

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tournaments_host_user ON tournaments (host_user_id) WHERE host_user_id IS NOT NULL;
CREATE INDEX idx_tournaments_host_org  ON tournaments (host_org_id)  WHERE host_org_id  IS NOT NULL;
CREATE INDEX idx_tournaments_group     ON tournaments (group_id)     WHERE group_id     IS NOT NULL;
CREATE UNIQUE INDEX uq_tournaments_report_token     ON tournaments (report_token)     WHERE report_token     IS NOT NULL;
CREATE UNIQUE INDEX uq_tournaments_submission_token ON tournaments (submission_token) WHERE submission_token IS NOT NULL;

-- Per-tournament staff, decoupled from friend-group roles.
CREATE TABLE tournament_staff (
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('organizer', 'judge', 'scorekeeper')),
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id, role)
);

-- Unified participant: walk-in name → invited/claimable email → linked account.
-- Replaces pod_players and the identity half of deck_check_entries.
CREATE TABLE tournament_participants (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         text REFERENCES users(id) ON DELETE SET NULL,   -- nullable: linked account
  display_name    text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  email           text CHECK (email IS NULL OR length(email) <= 254),
  riot_id         text CHECK (riot_id IS NULL OR length(riot_id) <= 120),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('requested', 'invited', 'active', 'dropped', 'no_show')),
  dropped_after_round integer,
  seed            integer,
  -- Claim machinery, lifted from deck_check_entries.
  claim_source    text CHECK (claim_source IS NULL OR claim_source IN
                    ('email_auto', 'judge_manual', 'self_submit', 'claim_link')),
  claim_token     text,
  claimed_at      timestamptz,
  claim_blocked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tournament_participants_tournament ON tournament_participants (tournament_id);
CREATE UNIQUE INDEX uq_tournament_participants_user
  ON tournament_participants (tournament_id, user_id) WHERE user_id IS NOT NULL;

-- Deck-check entries re-parented onto the tournament + participant.
-- deck_check_entry_cards is unchanged (entry-scoped). deck_check_events is dropped.
ALTER TABLE deck_check_entries
  ADD COLUMN tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  ADD COLUMN participant_id uuid REFERENCES tournament_participants(id) ON DELETE SET NULL;
-- The entry keeps its decklist, state machine, content_hash, and per-card
-- found_copies. Identity columns (player_name/email/riot_id/claim_*) move to
-- tournament_participants; the entry references the participant. See
-- "Implementation notes" for the exact column-by-column split.

-- Integration keys re-parented to the host (was group_id).
ALTER TABLE deck_check_keys
  ADD COLUMN host_type    text CHECK (host_type IN ('user', 'organization')),
  ADD COLUMN host_user_id text REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN host_org_id  uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- group_id dropped once backfilled.
```

The pod child tables are unchanged in shape. `pod_rounds.tournament_id` → `tournaments(id)` and `pod_members.player_id` / `pod_byes.player_id` → `tournament_participants(id)` (re-points, not reshapes). The lean derive-on-read model from ADR-022 (standings, opponent history, pod tallies folded from finalized rounds) is preserved verbatim.

### Participant lifecycle

- `requested`: added themselves via the open registration/submission link, awaiting host approval. Not counted for pairing.
- `invited`: host invited this email and a claim link was sent, pre-approved. Counts for pairing, and the account links on first claim.
- `active`: on the roster, counted for pairing and standings.
- `dropped`: dropped mid-tournament (ADR-022 semantics: stays in already-paired rounds, excluded from the next).
- `no_show`: was on the roster but did not play.

Host approval moves `requested → active` (approve) or deletes the row (deny). Provider pushes, judge/host manual adds, and email invites never enter `requested`. They are trusted and land `active` (or `invited` for an email awaiting first claim).

## Phasing

Each phase is an independently shippable migration that leaves the app working, backfills live rows losslessly, and is reversible before the next lands. Regenerate `docs/schema.sql` in the same commit as each migration (repo convention), and ask before running `bun db:migrate` (shared DB). The whole surface stays behind a `tournaments` feature flag (renamed from `pod-tournaments`, registered in `KNOWN_FLAGS`) until the umbrella UI is ready.

**Phase 1: Hosts, staff, group link (additive, low risk).**
Add `organizations` + `organization_members`. Rename `pod_tournaments` → `tournaments` and add the host / group / format / pairing / deck-module / deck-phase / token columns, backfilling existing rows as `host_type='user'`, `host_user_id = owner_user_id`, `format='pod_rounds'`, all modules off. Add `tournament_staff`, seeding each existing owner as `organizer`. The pod runner works exactly as before. ADR-014's reserved name is formally released here.

**Phase 2: Unified participants (the crux).**
Rename `pod_players` → `tournament_participants`, add the identity + claim columns, and the one-per-account unique index. Existing pod players backfill as walk-ins (name only). Re-point `pod_members.player_id` / `pod_byes.player_id`. The derive-on-read folds (`loadPairingSnapshot`, `computeStandings`, `loadRounds`) move to the participant table keeping their logic. A fixture tournament must produce identical pairings before and after.

**Phase 3: Deck check as a module.**
Migrate every `deck_check_events` row into a `tournaments` row (reusing the event uuid as the tournament id, `host_type='user'` from the group owner, `group_id` set, `format='none'`, `deck_submission` from `allow_self_submission`, deck-check on, `deck_phase` from `status`/`submissions_close_at`). For each entry, create a `tournament_participants` row from its identity + claim columns and re-point the entry's `participant_id` + `tournament_id`. Migrate the group's `judge`-role members to `tournament_staff(judge)` on those tournaments, then drop `judge` from the `friend_group_members` enum. Re-parent `deck_check_keys` to the host. Drop `deck_check_events`. The ingest contract field becomes `tournamentId`. The `group_id NOT NULL` binding is gone.

**Phase 4: Organization surfaces + unified UI.**
Admin org provisioning, org member management, org-hosted tournament lists, the unified tabbed tournament page, the creation wizard, the request-to-join + approval surface, and the group "Events" lens. (Phases 1–3 already store the data; this builds the surfaces and retires the old routes.)

Format generalization (Swiss, Top-N cut, 1v1 `versus` pairing with match points + OMW%/GW% tiebreakers, single-elim bracket) is explicitly out of scope and is a later ADR. The `format` / `pairing_style` columns and the `pod_rounds`/`pods` seam exist so it lands additively.

### Consequences

- Good, because the six product requirements become values on one row plus optional child rows, instead of a choice between three products that each refuse part of the list.
- Good, because organizations are a real host: an LGS runs many tournaments under one identity with shared staff, and admin-provisioning prevents a stranger registering a real store's name.
- Good, because judges and scorekeepers are grantable on any tournament, group-linked or not, fixing the friend-group-role coupling, and the friend-group hierarchy loses a value it no longer needs.
- Good, because one participant identity ends the double-model: deck submission, pairing, and standings all key off the same `tournament_participants` row, the one-per-account index de-dupes a person, and the claim flow makes "walk-in today, account tomorrow" a state transition rather than a re-entry.
- Good, because the proven pod engine and its lean derive-on-read model are preserved untouched. This is a re-parenting, not a rewrite of the pairing math.
- Good, because the approval gate is precise: a stranger can't put themselves in your standings, but a store's authenticated bulk push and the host's own roster work stay frictionless.
- Good, because the `format` / `pairing_style` seam means Swiss / cut / 1v1 are a future additive ADR, not blocked by this structure.
- Bad, because Phase 2 (participant unification) and Phase 3 (deck-check absorption) are non-trivial live-data migrations touching FKs the pairing engine and the deck-check UI both depend on. Mitigated by sequencing them after the additive Phase 1, backfilling conservatively, asserting identical pairings on a fixture, and keeping each phase independently shippable and reversible.
- Bad, because renaming the ingest field to `tournamentId` breaks a live provider's pushes until they reconfigure. Accepted: the migrated event keeps its uuid (only the field name changes), the break is loud (422) rather than silent, and the clean-break choice matches the "no URL redirects" stance. The provider edits one config value.
- Bad, because dropping the `/tournament-*` routes and `/tournaments/run` 404s any shared links. Accepted per the "no redirects" decision. The audience is small and the surface is flag-gated until ready.
- Bad, because a polymorphic host (`host_type` + two nullable FKs + a CHECK) is more complex than a single `owner_user_id`. Accepted: the requirement is explicit, and the CHECK makes "exactly one host" a database guarantee.
- Neutral, because the `tournaments` name moves from the unbuilt ADR-014 archive to this umbrella. No built code or data is affected.

### Confirmation

- Schema invariants (integration tests, temp DB): the host CHECK rejects a row with neither or both host FKs; the format/pairing CHECK rejects `format='none'` with `pairing_style='pod'`; the deck-check CHECK rejects `deck_check_enabled` with `deck_submission='none'`; the non-empty CHECK rejects a `format='none'` tournament that also takes no decks; the one-per-account unique index rejects a second linked participant for the same user; deleting a host (user/org) cascades its hosted tournaments; deleting a `tournaments` row cascades staff, participants, pod rounds/pods/members, and deck-check entries.
- Migration tests: Phase 1 leaves every existing pod tournament playable (owner → `host_user_id` + `organizer` staff, modules off); Phase 2 produces byte-identical pairings against the renamed participant table on a fixture; Phase 3 turns a seeded `deck_check_event` + entries into a `format='none'` group-linked tournament + participants + entries with decklist, content_hash, claim state, and group judges (→ `tournament_staff`) all preserved, the event uuid reused as the tournament id, and `friend_group_members` no longer accepting `judge`.
- Behavioral: a `deck_submission='required'` + `deck_check_enabled` tournament shows the deck-check surface to `judge` staff and to the participant via their claim/submission token; a pure pod tournament shows no deck surfaces; a `format='none'` tournament hides Pairings/Standings; a self-service registration lands `requested` and the host approves it to `active`; a provider push lands `active` with no approval; the group "Events" tab lists exactly the tournaments whose `group_id` matches.

## Design Decisions

### UI: one tournament, conditional modules

A single `/tournaments` area, reusing ADR-022's `TournamentPageFrame` shell and the page-top-bar / breadcrumb primitives. The detail page is a tabbed route where tabs light up by config:

- **Overview:** host, status, schedule, which modules are on, pending join requests (host).
- **Participants:** the roster (walk-in add, invite by email, link to account, approve/deny requests, drop). Replaces both the pod "Players" tab and the deck-check entries roster.
- **Pairings / Standings:** present when `pairing_style <> 'none'` (today: pods). The existing ADR-022 tabs, verbatim. Hidden for a `format='none'` event.
- **Deck Check:** present when `deck_check_enabled`. The existing ADR-025/026/027 judge surfaces, re-keyed to participants.
- **Staff:** organizers/judges/scorekeepers (host-only). `judge` does deck-check actions, `scorekeeper` enters results, `organizer` does everything, and org owner/manager are implicit organizers.
- **Settings:** host, group link, format, deck-submission config + deck phase, tokens.

Creation is a short wizard writing these columns: **host** (you / an organization you manage) → **format & pairing** (pod rounds 3/4, or deck-check-only) → **deck submission** (none / optional / required, + deadline & lock mode) → **judges & deck check** (on/off) → **registration** (open self-registration link on/off). A three-field pod night and a fully-loaded store event are the same wizard with different toggles.

The participant-facing flows (submit/claim/view your decklist) live under `/tournaments/$id/...` driven by the tournament's `submission_token` / participant `claim_token`. The old top-level `/tournament-decks`, `/tournament-submit/$token`, `/tournament-claim/$token` and the `/tournaments/run` subtree are removed (no redirects).

### Group "Events" tab becomes a lens, not a system

`/groups/$slug/events` becomes a filtered view of `tournaments WHERE group_id = thisGroup`. "Create event" pre-fills the group association and defaults the deck modules on (matching today). Group linkage grants group members visibility of the tournament and its standings. Roster import from group membership is deferred. The tournament is hosted by a user or org, not "owned by the group."

### Host model and authorization

`host_type` + two-nullable-FK + CHECK guarantees exactly one host. Authorization composes two layers. **Host authority** (the hosting user, or an `organization_members` row, where both `owner` and `manager` qualify and are implicit organizers on every tournament the org hosts) configures the tournament and manages staff. **Staff grants** (`tournament_staff`) delegate `judge` or `scorekeeper` to specific users without making them co-hosts. This replaces both ADR-022's single-owner check and deck check's friend-group-role check with one tournament-scoped model that works identically for a person or a store.

### Self-service registration and the approval gate

Today (ADR-025/026) there is no approval: a provider pushes entries over an authenticated key, a judge types one in, or a logged-in user with the `submission_token` link self-submits. For the self-service path, holding the link is the permission. This ADR adds one gate, for the self-service path only:

- **Trusted paths stay auto-active.** Provider push (API key), judge/host manual add, and email invite create `active` (or `invited`) participants with no queue.
- **Self-service via the open link lands `requested`.** A stranger opening the registration link requests to join. A stranger using the open submission link creates a `requested` participant carrying their submitted deck. The host approves (`→ active`, deck enters the check queue) or denies (row discarded). `self_registration` toggles whether the link is open at all. `submission_token` is the capability and rotates to cut off a leak.

### What the pairing module keeps from ADR-022

Everything. The pure engine in `packages/shared/src/pairing/`, the `PairingStrategy` seam, `determinePodSizes`, the penalty function, `pointsForPlacements`, the lean derive-on-read standings, the finalize-is-a-status-flip lifecycle, and the report-token follow-along are all preserved. The only change is the parent FKs. `format='pod_rounds'` / `pairing_style='pod'` are the only pairing values the CHECK allows this round. Adding `'swiss'` / `'versus'` is a future migration that widens the CHECK and adds a sibling strategy, not a reshape.

## Will Not Be Built (this round)

- **Swiss, Swiss + Top-N cut, 1v1 `versus` pairing, single-elim brackets.** Designed-for (the `format` / `pairing_style` seam exists), not built. A later ADR adds the Swiss strategy, match-point standings, and OMW%/GW% tiebreakers.
- **One-click roster import from a linked friend group.** Group linkage is visibility-only this round.
- **Public / indexable tournament pages.** Visibility is private + token links, `noIndex`.
- **Organization branding** (logo, website, location) and public org pages beyond a host listing.
- **Multiple deck-check events per tournament.** One decklist per participant per tournament.
- **Redirects from the old `/tournament-*` and `/tournaments/run` URLs.**
- **The ADR-014 decks archive.** Untouched and unbuilt; this ADR only releases the `tournaments` name.
- **Cross-tournament player profiles / "all events by player X".**
- **The `scorekeeper` staff role.** Deferred: result entry stays host/organizer-only for now, so `tournament_staff` ships with just `organizer` and `judge`. Re-add `scorekeeper` (and widen the role CHECK) when result entry is delegated to non-organizer staff. This is a later additive change, paired with the format/standings generalization above.

## Deferred / Out of Scope

- Format generalization and its standings/tiebreaker math (above).
- Org branding and public org pages.
- Friend-group roster import.
- Player-initiated withdrawal, in-app notifications on link/verdict/approval (inherited deferrals from ADR-026).
- Prize structure, registration fees/payments, check-in / QR, multi-day scheduling.

## Implementation notes

These close the gaps an implementer would otherwise have to guess. Read `docs/schema.sql` for the authoritative current columns before writing any migration (it is the source of truth, not the ADR-025/026 sketches, some proposed columns were never built).

### `deck_check_entries` column split (Phase 3)

The current table is the authority. As of this writing its columns are: `id, event_id, external_id, player_name, player_email, riot_id, submitted_at, content_hash, checked_by, checked_at, notes, change_summary, withdrawn_at, created_at, updated_at, claimed_user_id, claim_source, claimed_at, claim_blocked_at, player_message, allow_name_sharing, allow_riot_id_sharing, state, review_outcome, approved_by, approved_at, unlock_requested_at, pre_edit_lines, allow_deck_publishing, claim_token`. The ADR-026 columns `list_owner` and `provider_push_ignored_at` were never built (no edit-takeover state exists in the schema). Do not migrate them.

- **Move to `tournament_participants`** (per-person identity + claim): `player_name → display_name`, `player_email → email`, `riot_id`, `claimed_user_id → user_id`, `claim_source`, `claim_token`, `claimed_at`, `claim_blocked_at`, and the identity-consent flags `allow_name_sharing`, `allow_riot_id_sharing`.
- **Stays on `deck_check_entries`** (per-submission decklist + verification): `external_id`, `content_hash`, `submitted_at`, `state`, `review_outcome`, `checked_by`, `checked_at`, `approved_by`, `approved_at`, `notes`, `player_message`, `change_summary`, `pre_edit_lines`, `unlock_requested_at`, `withdrawn_at`, `allow_deck_publishing` (a deck-publishing consent, not identity), `created_at`, `updated_at`, plus the new `tournament_id` / `participant_id`. Drop `event_id` after backfill.

### `format` naming collision: add `deck_format`

`tournaments.format` in this ADR means the pairing structure (`none` / `pod_rounds`). But `deck_check_events.format` is the deck-legality format (a `deck_formats` slug, e.g. the game format used for legality + `allowed_sets` checks). These are different concepts. Add a nullable `deck_format text REFERENCES deck_formats(slug)` column to `tournaments`. Migrate `deck_check_events.format → tournaments.deck_format` (never into `format`). The deck-check legality validation reads `deck_format` + `allowed_sets`.

### `deck_check_events → tournaments` field mapping (Phase 3)

Reuse the event uuid as the tournament id. `group_id → group_id`; host is the group's owner (`friend_group_members.role='owner'` → `host_type='user'`, `host_user_id`); `name → name`; `event_date → starts_at`; `format → deck_format`; `allowed_sets → allowed_sets`; `status`: `active → 'running'`, `archived → 'completed'`; `format='none'`, `pairing_style='none'`, `deck_check_enabled=true`, `deck_submission='optional'` (every migrated event has decks, satisfying the deck-check CHECK); `self_registration = allow_self_submission`; `submission_token`, `submissions_close_at`, `list_lock_mode` map across verbatim; derive `deck_phase` (archived → `locked`; past `submissions_close_at` → `closed`; else `open`). `deck_check_keys`: host is the same group owner (`host_type='user'`, `host_user_id`), `group_id` dropped after backfill.

### Duplicate-participant resolution (Phase 3)

ADR-026 permits one person to hold two entries in one event (a provider entry plus their `openrift:` self-submission). The new `UNIQUE (tournament_id, user_id)` would reject both linking to the same account. Resolution, lossless and constraint-safe: group an event's entries by `claimed_user_id`. For each non-null group create one participant and attach all that user's entries to it (a participant may transiently own more than one decklist entry, exactly today's pre-reconciliation state, which a host resolves as before). Entries with null `claimed_user_id` each become their own walk-in participant (the unique index does not apply when `user_id IS NULL`). Nothing is dropped or merged automatically.

### Reversibility

Each phase ships a paired down migration (`bun db:rollback` exists). Do destructive steps (dropping `deck_check_events`, removing `judge` from the `friend_group_members` CHECK, dropping `group_id` columns) as the last migration of their phase, after the additive backfill is verified, so an earlier rollback never loses data. "Reversible before the next phase lands" means: keep the old structures one release, cut over, then drop.

### One submission token, two behaviors

There is a single `submission_token` per tournament. `self_registration` gates whether the open link accepts anyone at all. Opening the link as a logged-in user: when `deck_submission <> 'none'`, it shows the submit-a-deck form and creates a `requested` participant plus a deck entry. When `deck_submission = 'none'` (a pairing-only event that still wants open sign-ups), it shows a plain "request to join" button and creates a `requested` participant with no deck. Either way the participant lands `requested` for host approval (self-service gate). `report_token` is unrelated (spectator follow-along + pod result entry) and exists only for pairing formats.

### Feature flag and admin provisioning

The `pod-tournaments` flag is renamed to `tournaments` and registered in `KNOWN_FLAGS` (`apps/web/src/components/admin/feature-flags-page.tsx`). Flags are admin-managed, not migrated, so renaming loses existing enablement. Re-enable `tournaments` in the admin UI after deploy. Organization provisioning is an admin-only surface under the existing admin area (per ADR-032's prefix-gated admin model). Follow the feature-flags / admin-page pattern for the create-organization form.

## More Information

Relationship to other ADRs:

- **ADR-022 (FFA pod pairing)** is re-parented, not replaced: engine, lean model, and report-token flow preserved. `pod_tournaments` → `tournaments`, `pod_players` → `tournament_participants`. This ADR supersedes ADR-022's "not group-scoped, single account owner, free-text players with no account link" stance.
- **ADR-025 / 026 / 027 (deck check)** are re-parented: the entry-state machine, claim flow, content-hash invalidation, edit-takeover, and judge actions are preserved, but `deck_check_events` is absorbed into `tournaments` (`format='none'`), entries key off `tournament_participants`, the `group_id NOT NULL` binding is dropped, integration keys move to the host, the friend-group `judge` role is retired in favor of `tournament_staff`, and the ingest field is renamed `eventId → tournamentId`. This ADR supersedes ADR-025's "off the `/tournaments` hub" and group-owned-event stances.
- **ADR-013 (friend groups)** stays the structural template and gains an optional, non-owning, visibility-only association from `tournaments.group_id`. Its role enum drops `judge` (`owner > admin > member`). Friend-group roles no longer gate tournament judging.
- **ADR-014 (Tournament Decks Archive)** is unbuilt and releases the `tournaments` table name to this umbrella. If ever built it takes a distinct name (e.g. `deck_archives`). The two would share only the `/tournaments` URL home.
- **ADR-032 (admin authorization model)** informs the host/staff layering and the admin-provisioning of organizations. Tournament staff grants are tournament-scoped and independent of the global admin role.
