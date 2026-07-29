---
status: accepted
date: 2026-06-12
---

# ADR-026: Player Self-Service for Deck Checks

> **Amended 2026-07-26 ([ADR-033](033-unified-tournaments.md)).** Two of the decisions below were written for a world with no player-visible tournament entity, and ADR-033 built one.
>
> - **Linking** no longer auto-matches on email. ADR-033 made a participant either a linked account or an accountless walk-in claimed through its claim link; migration 176 dropped `tournament_participants.email` and the auto-match it fed. Claim tokens and judge manual links are the only two sources.
> - **Surface** is no longer a standalone "My tournament decks" list in the header user menu. Per ADR-033's "participant-facing flows live under `/tournaments/$id/…`", the player's deck is a section of the tournament it belongs to: a My deck tile on the tournament dashboard opening `/tournaments/$id/my-deck`. The cross-event index is `/tournaments` itself, which already lists every tournament the viewer hosts, judges, or plays in. The reasoning for keeping the label off `/tournaments` (a collision with ADR-022's pod runner and ADR-014's archive) expired when ADR-033 claimed that name for the umbrella.
>
> The PII boundary is unchanged and still the point: the read is keyed on the caller's own participant link, so a tournament-addressed request can only ever return the caller's own entry.

> **Amended 2026-07-29.** Two more deltas, both older than the note above but never recorded here:
>
> - **Editing** was superseded by [ADR-027](027-deck-check-entry-states.md): the "edit gate: reuse re-import invalidation" decision (entries are now editable only in the `editable` lifecycle state) and edit-takeover (`list_owner` and `provider_push_ignored_at` were dropped; provider pushes always win). The reserved `openrift:` namespace stays.
> - **Claim links** now land at `/tournaments/claim/<token>` (ADR-033 moved participant flows under `/tournaments`), and the ingest field is `tournamentId`, not `eventId`. The examples below show the original shapes.

## Context and Problem Statement

ADR-025 built deck checks as a judge-only tool: an organizer pushes entrant decklists into a group over a machine API, and a team of judges verifies them. Entrants are free-text identity with no `users` link, lists arrive only over the ingest API, and nothing about a check is visible outside the judging team. ADR-025 deliberately deferred three things to keep that first version tight: player accounts / a claim flow, a submission flow inside OpenRift, and any non-judge visibility of entrant lists.

Feedback from the first live event asked for exactly those three. Players want to see their own (and only their own) entered deck, want to submit a deck to an event directly through OpenRift instead of only through the organizer's site, and want to be able to correct their list, with the correction marked for a judge rather than applied silently.

ADR-025 anticipated this: it kept raw provider lines verbatim, captured consent from day one, stored `player_email` and the player handle (since renamed to `riot_id`) as "the claim keys a future account link would match on," and stated the link would be "one additive nullable `claimed_user_id` column, never a rewrite." This ADR cashes that in. The decision is how an entry gets linked to an OpenRift account, how a linked player reaches their own entry without becoming a judge or even a group member, how direct submission coexists with provider pushes, and what happens when a player edits a list that a provider also feeds.

This ADR supersedes three of ADR-025's "Will Not Be Built" stances (player accounts/claim, in-app submission, non-judge visibility). Everything else in ADR-025 stands.

## Decision Drivers

- **A player sees only their own entry, never anyone else's.** The PII boundary ADR-025 drew (entrant emails and lists are `judge`-and-above only) must not crack. A player-facing surface is a new way data leaves the judging team, so it has to be scoped to a single entry the viewer provably owns.
- **A player is not a judge and need not be a group member.** Entrants are the organizer's customers, not members of the organizer's group. Reaching one's own entry must not require a group role or a seat on the roster.
- **Linking must not depend on the provider.** The reference WordPress plugin and any other source already collect a name, an email, and a list. Asking every provider to also collect and forward an OpenRift account id is friction we cannot impose and cannot trust.
- **Submission and editing must reuse what exists.** OpenRift already owns decks, deck codes, the deck-rules validator, and `CardCell`. A player submitting or editing should ride that, not a parallel deck editor.
- **A stale check must never pass a changed deck (still).** ADR-025's invalidation rule is the backbone. A player edit is just another way the list changes, so it must trigger the same reset-and-re-verify, not a side channel that bypasses it.
- **The organizer can always pull a player.** Whatever ownership a player gains over their list, an organizer withdrawing an entrant must keep working.
- **"Deck check" is judge language.** A player thinks "I entered a tournament and want my deck," not "I want to see a deck check." The player-facing surface must speak the player's vocabulary without colliding with the two existing concepts that already own the word "tournament" (ADR-014's archive, ADR-022's pod runner).

## Considered Options

Six axes, each with the option chosen below.

1. **Entry-to-account linking:** the provider pushes an OpenRift account id; auto-match an entry to a verified-email account; a judge links manually; or the player self-claims a matching entry.
2. **Player access model:** orthogonal access keyed on the linked account, independent of group role; or pull entrants into group membership as `member`.
3. **Player-facing surface and name:** a player-vocabulary surface ("My tournament decks") off the `/tournaments` hub; reuse the judge "deck check" label; or a unified player tournament hub spanning the pod runner too.
4. **Direct submission:** per-event opt-in with a shared submission link; always-on submission for any event; or no in-app submission (provider only).
5. **Player edit gate:** reuse ADR-025's re-import invalidation; a separate pending-revision state machine a judge approves; or a time-locked edit window.
6. **A provider-fed entry edited by a player:** edit-takeover (the entry becomes player-owned and provider pushes stop overwriting its list); flag-only (the player cannot rewrite a provider list, only message a judge); or last-writer-wins between player and provider.

## Decision Outcome

- **Linking: auto-match on verified email, plus a judge manual link.** An entry whose `player_email` matches a user's account email (case-insensitively) is linked to that account only when `users.email_verified` is true. The match runs at ingest, via a one-off backfill, and lazily when a player loads their entry list or opens a submission link, so an account created after the provider push still links with zero player action. Where the email misses entirely (the player registered with a different or unverified email), a judge links the entry to an account from the checker page. We do not ask providers to forward account ids, and we do not build a player self-claim flow; auto-match covers the common case, and the judge link covers the rest with a human in the loop. (A later amendment adds a third source, provider-issued claim tokens, for providers that withhold the email auto-match depends on; see "Amendment: Claim Tokens" below.)
- **Access: orthogonal, keyed on `claimed_user_id`.** A player reaches an entry because it is linked to them, full stop. This is a new access path that does not touch the friend-group role hierarchy: the player needs no group role and does not appear on the roster. The judge-facing `deck_check` surfaces stay exactly as ADR-025 left them.
- **Surface and name: "My tournament decks," in the header user menu, off the `/tournaments` hub.** The schema and the judge surface keep the `deck_check_*` name; only the player label changes. We do not reuse the bare word "tournaments" (owned by ADR-022's pod runner and ADR-014's archive) and we do not build a unified cross-subsystem hub now.
- **Submission: per-event opt-in with a shared submission link.** An admin turns on `allow_self_submission` for an event and shares a per-event `submission_token`. A logged-in user holding the link can submit while submissions are open. The player submits by picking one of their existing OpenRift decks or pasting a deck code; the entry is a frozen snapshot, the same shape a provider push produces. If an entry in the event is already linked to the submitter, the submission edits that entry rather than creating a duplicate.
- **Edit gate: reuse re-import invalidation.** A player edit recomputes the entry's `content_hash` and runs ADR-025's exact path: if the list changed and the entry was already checked, it reverts to `unchecked`, ticks clear, and a `change_summary` is stored for the judge to re-verify. The judge re-checking is the approval. There is no separate pending-revision table and no new verdict state. Editing is available to any linked player while the event is open; it does not require `allow_self_submission`, which gates only the creation of new entries.
- **Provider-fed entry edited by a player: edit-takeover.** When a player edits a provider-fed entry, the entry's list ownership flips to the player and later provider pushes no longer overwrite its card content. The organizer can still withdraw the entry (an explicit `"withdrawn": true` is always honored), and the judge sees that the list is player-owned plus a quiet marker that a provider push was ignored.

### Consequences

- Good, because the PII boundary holds by construction: a player query is scoped to `claimed_user_id = viewer` and returns one entry's deck, never the entrant list, never another player, never the judge's private notes.
- Good, because linking needs nothing from providers; the common case is automatic on the email they already collect, and the fallback is a judge action that already fits the checker page.
- Good, because submission and editing reuse decks, deck codes, the deck-rules validator, and `CardCell` with no second editor, and because editing rides ADR-025's invalidation rather than inventing an approval workflow.
- Good, because orthogonal access avoids swelling group rosters with every entrant and avoids conflating "I entered your tournament" with "I am a member of your group."
- Bad, because auto-match trusts the provider's `player_email`. A mistyped address can mis-attribute an entry: if entrant A's list arrives carrying user B's address, verified user B sees A's deck, name, and Riot ID. The verified-email gate bounds the blast radius to that single entry (the entrant list and every other entry stay sealed) and an attacker cannot steer it, because nobody can make someone else's entry carry their email without the provider sending it that way. We accept the residual mis-attribution risk and let a judge unlink, which also blocks the entry from re-matching.
- Bad, because edit-takeover splits a single entry's list ownership between two writers over its lifetime, and the judge has to understand that a provider push was ignored. Mitigated by the explicit `list_owner` flag and the ignored-push marker, and by keeping withdrawal always-wins so the organizer is never stranded.
- Bad, because a person can still end up with two entries when their provider entry carries a different (or no) email than their account, so the submission-time match cannot see it. Submission edits the linked entry where a link exists, which removes the common duplicate; the residual case is reconciled by a judge, not auto-merged. Deferred below.
- Bad, because a third tournament-flavored player label now exists alongside the pod runner and the proposed archive. Mitigated by keeping the surface off `/tournaments`, keeping the schema on `deck_check_*`, and not building a unified hub until one earns its keep.

## Design Decisions

### Linking an entry to an account

A new nullable `deck_check_entries.claimed_user_id` references `users(id)`, with `claim_source` recording how the link was made (`email_auto`, `judge_manual`, `self_submit`) and `claimed_at` when. This is the exact column ADR-025 reserved.

Auto-match links an entry whose `player_email` matches a `users` row with `email_verified = true`; the comparison is case-insensitive (both sides lowercased and trimmed). The verified gate is load-bearing; an unverified or absent email never links, and an entry that is already linked or blocked (below) is never re-matched. The match runs at three points, all setting `claim_source = 'email_auto'`:

- in the ingest layer, after an entry is upserted;
- lazily, when a player loads "My tournament decks" or opens a submission link, by querying unclaimed entries against the viewer's own verified email (served by an index on `lower(player_email)`); this covers the common timeline where the account is created or verified only after the provider pushed, with zero player action and no background job;
- via a one-off backfill for entries that predate this ADR, so judges see existing links without waiting for each player's first visit.

The judge manual link is an action on the checker page (`judge`+): search an account by email or name and attach it, setting `claim_source = 'judge_manual'`. A judge can also unlink, which is the remedy for a bad auto-match. Unlinking clears `claimed_user_id`, `claim_source`, and `claimed_at`, and sets `claim_blocked_at`: a blocked entry is never auto-matched again, by any of the three paths. Without the block, the next provider re-push of the same `player_email` would silently restore the bad link the judge just removed. A later judge manual link clears the block. Linking is per entry; auto-match on email naturally links every entry sharing that address across events.

A self-submitted entry is born linked (`claim_source = 'self_submit'`), so the three sources partition cleanly: machine push plus email match, human judge action, or the player creating it.

### Player access, scoped to the owner

The player surfaces do not go through `requireRole`; they go through a new check that the entry's `claimed_user_id` equals the authenticated user. There is no group-membership requirement and no role grant. A repository method returns the caller's own entries (`claimed_user_id = :userId`, withdrawn included so the list can badge them) for the list, and a single-entry fetch is guarded by the same equality before it returns anything.

The response is a strict subset of the judge payload: the deck rendered by zone, per-card match status, the legality and deck-stat advisories ADR-025 already computes, the verdict status (`unchecked` / `checked` / `issue`), and a player-visible `player_message`. It never includes other entrants, the entrant list, `checked_by`, or the judge-private `notes`. The existing defensive response mapper that honors `publish_opt_out` is the right home for this projection. A judge writes `player_message` from the checker page; it is the player-facing channel ("fix the rune count and resubmit"), kept deliberately separate from the judge-private `notes`.

### Player-facing surface and naming

The player label is "My tournament decks," reached from the header user menu (a niche surface that does not belong in primary nav). The list shows, per entry, the event name, the owning group, the date, a status badge, a "changed since check" marker where relevant, and a "withdrawn" badge where the organizer pulled the entry, rather than making it silently vanish. An entry detail renders the deck read-only.

This is a label and information-architecture decision only. The schema stays `deck_check_*`, the judge surface stays `/groups/$slug/checks`, and the player route stays off `/tournaments` so it does not collide with ADR-022's pod runner or ADR-014's proposed archive. A player never sees the words "deck check."

The player surfaces ship unconditionally, with no feature flag of their own. An earlier draft of this ADR proposed a dedicated flag registered in `KNOWN_FLAGS`; it was never implemented (the surfaces shipped ungated), and the "Amendment: Claim Tokens" decision ratifies that. The surface is additive and access-scoped (a player only ever reaches their own linked entry), so it goes live with the deploy rather than being dark-launched. ADR-025's judge-tool flag is unaffected.

### Direct submission

Two additive event fields gate submission: `allow_self_submission` (default false, so every existing event is unchanged) and a nullable unique `submission_token` (the shared capability, minted when an admin enables self-submission, mirroring the group join-code pattern). A nullable `submissions_close_at` bounds the window; submission is allowed while `allow_self_submission` is on, the event is not archived, and `submissions_close_at` is null or in the future. Turning `allow_self_submission` off closes the door regardless of the token (the flag is checked on every request, not just the token's existence), and an admin can regenerate the token to cut off a leaked link, mirroring the join-code rotation.

A logged-in user holding the link lands on an event submission page showing the event name, format, allowed sets, and deadline. They pick one of their existing OpenRift decks, paste a deck code, or paste a plain text decklist (parsed by the same parser the judge's manual entry uses); a live legality and allowed-sets preview runs before they commit, using the same shared deck-rules. Legality is advisory, not a hard block, consistent with ADR-025; the judge decides.

Submitting first runs the lazy email match for the event. If an entry in the event is already linked to the submitter (auto-matched, judge-linked, or a prior self-submission), the submission replaces that entry's list: this is exactly the player-edit path below, including edit-takeover for a provider-fed entry, so "submitting a correction" never creates a duplicate next to an entry that is already the player's. Otherwise it creates a `deck_check_entry` with `external_id = 'openrift:' + userId`, `claimed_user_id` set to the submitter, `claim_source = 'self_submit'`, and `list_owner = 'player'`. Player name and email are populated from the account (the email is the verified account email); the Riot ID stays empty. Because the external id is derived from the user, a second submission by the same user without any other linked entry upserts the same entry, which is to say it is an edit.

A withdrawn linked entry blocks both paths: submission neither revives it nor creates a fresh entry beside it, and the edit action is disabled ("withdrawn, contact a judge"). Withdrawal is the organizer's call; only a provider re-push without the flag or a judge undoes it. Without this rule, a pulled player could sidestep the withdrawal through the token link.

The `openrift:` namespace is reserved at the ingest API: a push containing an `externalId` starting with `openrift:` is rejected with 422, the same way an unknown section is. Without that rule, a buggy or hostile provider could upsert onto a self-submitted entry, overwriting its player fields or withdrawing an entry it never created; with it, "never subject to provider overwrite" holds by construction. This is the only change to ADR-025's ingest contract.

### Player edits and edit-takeover

A player edit replaces the entry's card lines and recomputes `content_hash`, then runs ADR-025's invalidation verbatim: unchanged hash is idempotent; a changed hash on an `unchecked` entry just replaces the cards; a changed hash on a `checked` or `issue` entry reverts it to `unchecked`, clears `checked_by` / `checked_at`, resets every `found_copies` tick, and stores a `change_summary` the judge sees as "changed since check." That re-verification is the "marked and approved by a judge" the feedback asked for; no new state machine is added.

For an entry that originated from a provider (`list_owner = 'provider'`), the first player edit flips `list_owner` to `'player'`. From then on the ingest layer, when it would upsert that entry, applies nothing from the push except an explicit `"withdrawn": true`: the card list, player name, email, Riot ID, `submitted_at`, and `publish_opt_out` all stay as the player-owned entry has them, and `provider_push_ignored_at` is set so a judge sees "provider tried to update, ignored." (Letting the push update `player_email` would also let it re-steer auto-match, so the ignore is total.) This is edit-takeover: the player owns the list, the organizer keeps the power to remove the entrant. A self-submitted entry is `list_owner = 'player'` from birth, so it is never subject to provider overwrite.

Editing is gated by the event window alone, not by `allow_self_submission`: a linked player may correct a provider-fed entry even when the event never opened token submissions. This is the case the live-event feedback actually described, and it is safe precisely because every edit rides the invalidation path, so a judge re-verifies before the correction counts. `allow_self_submission` gates only the creation of new entries. Once `submissions_close_at` passes or the event is archived, the edit action is disabled and reads "submissions closed, contact a judge."

### What a player learns, and when

Manual linking is passive: after a judge links an entry, it simply appears in the player's "My tournament decks" the next time they load it. ADR-025 chose no self-claim flow and this ADR keeps no in-app notification in v1; the judge tells the player out of band, or the player checks the page. An in-app notification on link is a clean later add if passivity proves too quiet.

### Duplicate entries for one person

Submission editing the linked entry (above) removes the common duplicate: a player whose provider entry is linked to their account can only ever correct it, never sit next to it. The residual case is a provider entry carrying a different (or no) email than the submitter's account, which neither auto-match nor the submission-time check can see; that person ends up with the unlinked provider entry plus their `openrift:` one. We do not auto-merge, because merging the wrong two entries is worse than showing both. A judge reconciles (withdraw one, or link the provider entry and let the player resubmit onto it). Auto-dedup heuristics are Deferred.

## Schema sketch

```sql
-- Extends ADR-025's deck_check_entries with the account link, list ownership,
-- and a player-visible message kept separate from the judge-private notes.
-- ALTER TABLE deck_check_entries
--   ADD COLUMN claimed_user_id text REFERENCES users(id) ON DELETE SET NULL,
--   ADD COLUMN claim_source    text CHECK (claim_source IS NULL OR
--                  claim_source = ANY (ARRAY['email_auto','judge_manual','self_submit'])),
--   ADD COLUMN claimed_at      timestamptz,
--   ADD COLUMN claim_blocked_at timestamptz, -- set on judge unlink; blocks all auto-match
--   ADD COLUMN list_owner      text NOT NULL DEFAULT 'provider'
--                  CHECK (list_owner = ANY (ARRAY['provider','player'])),
--   ADD COLUMN player_message  text CHECK (player_message IS NULL OR length(player_message) <= 2000),
--   ADD COLUMN provider_push_ignored_at timestamptz;
-- CREATE INDEX idx_deck_check_entries_claimed_user ON deck_check_entries (claimed_user_id);
-- CREATE INDEX idx_deck_check_entries_player_email ON deck_check_entries (lower(player_email));

-- Extends ADR-025's deck_check_events with the self-submission opt-in.
-- ALTER TABLE deck_check_events
--   ADD COLUMN allow_self_submission boolean NOT NULL DEFAULT false,
--   ADD COLUMN submission_token      text UNIQUE,
--   ADD COLUMN submissions_close_at  timestamptz;
```

The `deck_check_entry_cards` table is unchanged; a self-submitted or player-edited list writes the same rows a provider push does (raw name, section, normalized zone, quantity, resolution). Self-submission resolves cards through the same resolver, so a deck built in OpenRift produces `matched` lines directly.

## Will Not Be Built

- **Provider-forwarded account ids.** We do not extend the ingest contract with an OpenRift account id; linking is auto-match plus judge action. (Revisitable if a provider ever wants to assert the link itself.)
- **Player self-claim.** A player cannot browse for an entry that "looks like them" and claim it; matching is by verified email or a judge. This avoids a claim-dispute surface. (The provider-issued claim token added in "Amendment: Claim Tokens" is not this: the player never browses or asserts a match, the provider delivers an unguessable per-entry capability through its own email.)
- **A separate pending-revision approval workflow.** Player edits ride re-import invalidation; there is no holding state, no approve/reject queue, no second verdict axis.
- **Player visibility of the judging team's work.** No entrant list, no other players, no `checked_by`, no judge `notes`. A player sees their own deck, its status, and an optional `player_message`.
- **Auto-merge of duplicate entries.** Two entries for one person are reconciled by a judge, not merged automatically.
- **A unified player tournament hub.** "My tournament decks" lists deck-check entries only; it does not fold in ADR-022 pod tournaments. A cross-subsystem hub is a separate decision.
- **In-app notification on manual link.** Passive discovery in v1.
- **A player editor distinct from decks.** Submission and editing reuse the existing deck picker, deck-code import, and text-decklist parser; no bespoke entrant deck editor.

## Deferred / Out of Scope

- **Notification on link or on verdict.** Telling a player "you were linked" or "your deck was checked / flagged" in-app is a clean later add once a notification channel exists.
- **Auto-dedup of provider and self-submitted entries.** Submission already edits the linked entry instead of duplicating it; the residual case (a provider entry whose email differs from the submitter's account) is left to a judge in v1. A heuristic merge could come later.
- **Player-initiated withdrawal.** A player cannot withdraw their own entry in v1; the organizer or a judge does. Could be added behind the same window logic.
- **Localized card-name matching for self-submission.** Inherited from ADR-025: English canonical names only. A deck built in OpenRift sidesteps this, but a pasted code does not.
- **Submission without a link.** Discovery of open events without the organizer sharing a token (for example a public "events accepting submissions" list) is out of scope; the token is the capability.
- **Orthogonal access reused elsewhere.** The "scoped by ownership, independent of group role" pattern introduced here is not generalized to other group resources in this ADR.
- **Claim-token rotation.** A `claim_token` cannot be regenerated to invalidate a leaked unclaimed link in v1 (unlike `submission_token`). The remedy for a bad bind is the existing judge unlink plus `claim_blocked_at`. Per-entry rotation, surfaced in the judge UI, is a later add if leaked links prove to be a problem in practice. (Amendment: Claim Tokens.) _Update (ADR-033): built as the reissue action, which unclaims the participant, clears the block, and mints a fresh token._

## Confirmation

Schema and authorization invariants to exercise with integration tests:

- An entry whose `player_email` matches (case-insensitively) a `users` row with `email_verified = true` is linked with `claim_source = 'email_auto'` at ingest, on the player's first load of "My tournament decks" or a submission page, and via the backfill; an entry matching an unverified or absent email is never linked.
- A judge can link an entry to an account (`claim_source = 'judge_manual'`) and unlink it; a non-judge cannot. Unlinking clears the claim columns and sets `claim_blocked_at`; a subsequent re-push or lazy match never re-links a blocked entry, and a judge manual link clears the block.
- The player entry-list endpoint returns only entries where `claimed_user_id` equals the caller (withdrawn ones included, marked as withdrawn); a request for an entry not linked to the caller returns 404 (not 403, so existence is not leaked); the payload omits `notes`, `checked_by`, and every other entrant.
- Enabling `allow_self_submission` mints a `submission_token`; a logged-in user holding the token can create an entry while submissions are open; a submission after `submissions_close_at` or to an archived event is rejected; a submission to an event with self-submission off is rejected even with a valid token; regenerating the token invalidates the old one.
- A push containing an `externalId` starting with `openrift:` is rejected with 422 and nothing from that push is imported.
- A self-submitted entry has `external_id = 'openrift:' + userId`, `claim_source = 'self_submit'`, `list_owner = 'player'`, and account-derived player fields; a second submission by the same user upserts the same entry rather than creating a duplicate; a submission by a user who already has a linked entry in the event edits that entry instead of creating an `openrift:` one.
- A player edit recomputes `content_hash` and, on a previously `checked` entry, reverts it to `unchecked`, clears `checked_by` / `checked_at`, resets `found_copies`, and stores a `change_summary`; an identical edit is idempotent.
- The first player edit of a `provider` entry flips `list_owner` to `player`; a subsequent provider push to that entry leaves the card list and every player field untouched, sets `provider_push_ignored_at`, and yet an explicit `"withdrawn": true` in that push still sets `withdrawn_at`.
- A self-submitted entry (`list_owner = 'player'` from birth) is never overwritten by a provider push to the same event.
- A linked player can edit their entry while the event is open even when `allow_self_submission` is false; editing and submission are blocked once `submissions_close_at` passes or the event is archived; viewing the entry still works.
- A player whose linked entry is withdrawn can neither edit it nor submit again to that event (no revival, no fresh `openrift:` entry beside it); a provider re-push without the withdrawn flag still clears `withdrawn_at`.
- Deleting an event still cascades to its entries and cards (ADR-025 invariant), now including self-submitted ones; unlinking or deleting the linked user sets `claimed_user_id` to null without deleting the entry.

## Amendment: Claim Tokens (Providers That Withhold Email)

### Context

The base decision makes verified-email auto-match the load-bearing linking path and the judge manual link the fallback. A provider integration we expected to forward `player_email` will not: it keeps the entrant's address private and never sends it over the ingest API. That removes auto-match entirely for that provider's events. The judge manual link still works but does not scale to "every entrant can see their own deck," because it needs a judge to know and attach each player's OpenRift account by hand.

The same provider sends each entrant its own confirmation email, and asked to include a "register at OpenRift and view your deck" link in it. That email is the channel OpenRift lacks: the provider already knows which address belongs to which entry, even though it will not share the address. A linking path that rides that channel, without OpenRift ever seeing the email, is what this amendment adds.

### Decision: a third linking source, `claim_link`

Add a provider-issued capability token per entry. The ingest API mints a `claim_token` for each entry and returns it in the push response (see the ingest-contract change below). The provider embeds `${SITE_URL}/deck-check/claim/<token>` in its own confirmation email. A user who opens the link, registering or logging in if needed, claims that one entry: `claimed_user_id` becomes the viewer, `claim_source = 'claim_link'`, `claimed_at = now()`. From then on the entry behaves exactly like an auto-matched or judge-linked one: scoped read access through "My tournament decks," no group role.

This is provider-mediated, not the browse-and-claim "Player self-claim" the base ADR declines to build. The player never searches for an entry that "looks like them"; the provider vouches for the binding by delivering an unguessable token to the address it already holds. The token is the provider asserting the link through the channel it controls, the same assertion a provider-forwarded account id would have made, minus the friction of collecting the id.

It works with no dependence on OpenRift seeing the email. Where a provider does forward `player_email`, auto-match and the claim token coexist: the entry may already be linked by the time the token is opened, which the precedence rules below resolve.

### Claim flow and visibility

Opening the link is a GET that renders a confirmation landing page, and the claim itself is a POST behind a button on that page. The two-step shape is load-bearing: a mail client or browser that prefetches the GET must not be able to auto-claim the entry (or auto-trip the different-user refuse below) without the human acting. The landing page shows only the event name and the owning group, nothing about the entrant or the deck, because any holder of the link reaches it before proving anything; the player's name, Riot ID, and deck appear only after a successful claim, as the scoped projection the base ADR already defines.

If the viewer is not logged in, the landing routes through login or registration and returns to the same confirm step. A brand-new account may claim straight away: the token is the capability, so claiming does not wait on email verification. This deliberately diverges from auto-match, which requires `email_verified` precisely because the email is the only thing it has to go on; the claim token carries its own proof, and a verification gate would only block the just-registered player the flow exists to serve without raising the bar for an attacker (who could verify a throwaway address anyway).

### Claim precedence

Both a judge link and a token claim write `claimed_user_id`, so the claim endpoint resolves against the entry's current state:

- **Unclaimed and not blocked:** claim it, `claim_source = 'claim_link'`. The normal path.
- **Already claimed by the same user:** idempotent no-op; redirect to the entry. This is the common, friendly case where a judge linked the right account before the player clicked. `claim_source` is left as it was (a `judge_manual` link stays `judge_manual`), so the checker still shows the judge that they made the link.
- **Already claimed by a different user:** refuse, do not steal. Surface the conflict ("this entry is already linked to another account, contact the organizer"). A judge deliberately attaching an entry to account A must not be silently reversed by a token that reached account B through a forwarded or shared inbox.
- **`claim_blocked_at` is set:** refuse. A judge unlinking sets that flag precisely to stop re-linking; the base decision already has auto-match honor it, and the claim token honors it the same way. A later judge manual link clears the block, as before.

The token is not single-use. Gating is by the rules above, not by consumption, so an idempotent re-click, or a judge unlink-then-relink, never dead-ends on a spent token; the `claim_blocked_at` check is what actually shuts a token down when a judge wants it shut down.

The one genuinely ambiguous case, a judge having linked the wrong account while the real player holds the token, cannot be resolved safely in either direction, so the different-user refuse path is correct: it routes the conflict to a human (the judge unlinks, which blocks and detaches, then the player claims; or the judge relinks correctly) instead of guessing.

Withdrawal does not block claiming. Claiming grants only the scoped read the base ADR already extends to withdrawn entries (they appear in the list, badged), so a player can still open the link and see "withdrawn, contact a judge." Editing and resubmission stay blocked by the existing withdrawn rules.

### Ingest contract change

ADR-025's push response returned counts only. It now also returns a per-entry array so the provider can build its email links:

```jsonc
{
  "eventId": "…",
  "entriesCreated": 3,
  "entriesUpdated": 1 /* …existing counts unchanged… */,
  "entries": [
    {
      "externalId": "provider-123", // the provider's own key, for correlation
      "entryId": "…uuid…", // stable OpenRift entry id
      "claimUrl": "https://openrift.app/deck-check/claim/<token>",
    },
  ],
}
```

_Update (ADR-033): the field is now `tournamentId` and claim URLs land at `/tournaments/claim/<token>`. The `entriesIgnored` count that edit-takeover added is deprecated (always 0 since ADR-027) but still returned so existing integrations keep parsing._

This is additive and backward-compatible: a provider that ignores the new field keeps working. It is the second change to ADR-025's ingest contract, after the `openrift:` rejection. Building an absolute `claimUrl` requires `SITE_URL` in the API config (the web app already reads it, the API does not yet), kept an env var rather than hardcoded.

The `claim_token` is minted when the entry is created, backfilled for every entry that predates this amendment, and minted on any later push that finds an entry without one; once set it is stable, so the same entry always yields the same link and the provider can re-send it. The backfill plus mint-if-missing is what lets already-pushed events produce working links without recreating their entries. A self-submitted (`openrift:`) entry is born already linked, so its token never gets used, but it is still minted for shape uniformity.

The per-entry response carries `externalId`, `entryId`, and `claimUrl` only; it does not return the linked `claimed_user_id`. The provider's "Spieler-ID" need is met by the stable `entryId` (correlated to their own `externalId`), and OpenRift account ids are never exposed over the ingest channel.

### Schema delta

```sql
-- Extends this ADR's deck_check_entries with the provider-issued claim capability.
-- ALTER TABLE deck_check_entries
--   ADD COLUMN claim_token text UNIQUE;  -- minted at create, stable across pushes
-- The claim_source check gains the third automated source:
-- ALTER TABLE deck_check_entries
--   DROP CONSTRAINT deck_check_entries_claim_source_check,
--   ADD CONSTRAINT  deck_check_entries_claim_source_check
--     CHECK (claim_source IS NULL OR claim_source = ANY
--            (ARRAY['email_auto','judge_manual','self_submit','claim_link']));
```

### Consequences

- Good, because linking no longer depends on OpenRift seeing the email; it serves a provider that withholds the address, which auto-match cannot do at all.
- Good, because the capability is provider-issued and provider-delivered, so the trust boundary is the provider's own confirmation email, exactly where the entrant's identity is already established. No new claim-dispute surface inside OpenRift.
- Good, because it reuses the reserved claim columns and the existing scoped-access path; the only additions are one token column and one `claim_source` value, and the precedence rules keep judge action authoritative.
- Bad, because a leaked or forwarded token lets its holder claim that one entry and see its name, Riot ID, and deck. The blast radius is a single entry, the same bound the base decision accepts for a mistyped email under auto-match; the entrant list and every other entry stay sealed, and a judge unlink-and-block is the remedy. The different-user refuse rule stops a token from overriding a correct judge link, so an attacker cannot steer it onto someone else's entry.
- Bad, because the ingest response grows from counts to per-entry data. Mitigated by additivity (existing fields unchanged, new fields ignorable) and by it being the only response-shape change.

This amendment also settles the player self-service feature flag question (revising the base decision above): the surface ships with the deploy rather than behind a flag. The flag the original draft proposed was never built, so there is nothing to remove; the cost is only that the surface cannot be dark-launched or staged to a subset of users. Accepted because it is additive and access-scoped (a player only ever reaches their own linked entry, the judge tool and the PII boundary are untouched), so there is little a flag would protect against, and the judge tool it depends on is already live.

### Confirmation

Additional invariants to exercise:

- A push returns, per entry, its `externalId`, `entryId`, and a `claimUrl` carrying a per-entry `claim_token`, and never a `claimed_user_id`; re-pushing the same entry returns the same token; an entry that predates the amendment is backfilled with a token, and a push to an entry missing one mints it.
- The claim landing page (GET) performs no write and reveals only the event name and owning group; the claim happens only on the POST behind its button, so a prefetch of the GET claims nothing.
- Opening a valid token while logged in, confirming the POST, links the entry with `claim_source = 'claim_link'` and lands on it; opening it anonymously routes through login or registration and returns to the confirm step.
- A freshly registered account whose email is not yet verified can still claim via a valid token (the verification gate applies to auto-match, not to `claim_link`).
- A token for an entry already claimed by the caller is an idempotent no-op that still lands on the entry and leaves a prior `judge_manual` source unchanged.
- A token for an entry claimed by a different user is refused, with the existing link untouched.
- A token for an entry with `claim_blocked_at` set is refused; a later judge manual link clears the block and the token then works.
- The token is not consumed: a second open by the same caller still resolves to the entry.
- A token for a withdrawn entry still links and grants read access, while edit and resubmission stay blocked.

## More Information

Relationship to other ADRs:

- **ADR-025 (Deck Check for Tournament Judges).** This ADR extends ADR-025 and supersedes three of its "Will Not Be Built" stances: player accounts / a claim flow (now: account link by verified-email auto-match or judge action), a submission flow in OpenRift (now: per-event opt-in self-submission), and non-judge visibility of entrant lists (now: a player sees their own entry only). Every other ADR-025 decision (dedicated tables, the `judge` role, push-only provider ingest, content-hash invalidation, off the `/tournaments` hub) is unchanged; the two ingest-contract changes are that `openrift:`-prefixed external ids are now rejected as reserved, and that the push response now also returns a per-entry array carrying each entry's id and claim link (see "Amendment: Claim Tokens"). This ADR fills in the `claimed_user_id` column ADR-025 reserved.
- **ADR-013 (Friend Groups).** Unchanged. The player access path is deliberately orthogonal to the role hierarchy; entrants are not added to the roster and gain no group role.
- **ADR-014 (Tournament Decks Archive).** Still a separate, public, admin-curated concept. This ADR keeps the convergence ADR-025 described open: `claimed_user_id` is exactly the account-link column a future merge into `decks` would carry, now populated rather than reserved.
- **ADR-022 (FFA Pod Pairing).** Unchanged. The "My tournament decks" label and route stay off `/tournaments` precisely to avoid colliding with the pod runner; a unified player tournament hub spanning both is explicitly not built here.
