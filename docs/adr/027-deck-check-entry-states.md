---
status: accepted
date: 2026-06-12
---

# ADR-027: Deck-Check Entry Lifecycle States

## Context and Problem Statement

ADR-026 let players edit their tournament deck at any time while the event is open. The safeguard is invalidation: an edit to a reviewed list reverts it to `unchecked` with a stored diff, and the judge re-verifies. Feedback from organizers asks for the opposite default: a submitted deck must be locked against player edits, and a change must pass through a judge instead of applying silently with after-the-fact review.

ADR-026 also left two review concepts squeezed into one field. `check_status` (`unchecked` / `checked` / `issue`) was built for the event-day physical check, but organizers also want a pre-event "this list is legal" screening, which is a different judge action at a different time. And the ADR-026 edit-takeover rule (`list_owner`, ignored provider pushes) created a split-ownership model judges found hard to reason about.

This ADR replaces the invalidation-only model with an explicit entry lifecycle: every entry is in exactly one state, players can only edit in one of them, and moving between states is what players, judges, and providers do.

Two constraints from the official Tournament Rules sharpen the design. TR 401.3 — "Once a decklist has been registered and delivered to a competition official, it can't be changed" — means a player must not be able to change a submitted list on their own; the only ambiguity is _when_ a list counts as delivered (at submission, or when the registration window closes), which is the organizer's call. And the same rule cuts the other way: a list a player is still editing must not be _visible_ to any competition official, or its delivery could be argued to have already happened.

## Decision Drivers

- **A submitted deck is locked.** A player must not be able to change a list a judge may be looking at, silently or otherwise. Unlocking is an explicit, visible transition.
- **Judge work is protected by gating, not just invalidation.** Once a judge approved a list, undoing that approval crosses the judge's desk.
- **Pre-event approval and event-day verification are different acts.** A judge screening lists the week before and a judge counting physical cards at the venue need separate states, separate actors recorded, and separate timestamps.
- **One writer model.** The provider feed and the player must not own an entry's list simultaneously; whatever rule resolves a conflict must be simple enough to state in one sentence.
- **The deadline stays the outer boundary.** `submissions_close_at` bounds everything players do; judges keep a per-entry escape hatch for venue corrections.
- **TR 401.3 holds by default.** A registered list does not change without an official, and an unregistered list is not readable by one.

## Considered Options

1. **Entry lifecycle states** (chosen): `editable → submitted → approved → checked`, plus `withdrawn`; player edits only in `editable`; unlocking is a transition.
2. **Pending-revision proposals:** keep entries always-editable but stage edits as a proposed list a judge applies or rejects. Rejected: a second stored list per entry, a second diff surface, and an approval queue — more machinery for the same guarantee the lock gives directly.
3. **Keep ADR-026 invalidation, add a per-event "lock after submission" flag.** Rejected: the flag would gate a boolean edit-allowed check but still provide no pre-event approval concept and no visible lifecycle; half the feedback unaddressed.

## Decision Outcome

One state column, five values, and a transition matrix.

### States

| State       | Meaning                                                            | List editable by player |
| ----------- | ------------------------------------------------------------------ | ----------------------- |
| `editable`  | The player is working on the list; not sent for review.            | yes                     |
| `submitted` | Sent for review (by the player) or fed by the provider.            | no                      |
| `approved`  | A judge pre-approved the list before the event.                    | no                      |
| `checked`   | A judge verified the physical cards against the list at the event. | no                      |
| `withdrawn` | The organizer pulled the entry.                                    | no                      |

`approved` and `checked` each record who and when (`approved_by`/`approved_at`, the existing `checked_by`/`checked_at`). A separate `review_outcome` (`ok` / `issue`, nullable) records how the most recent judge review went, so "checked, but with an issue" and "sent back twice" stay visible without bending the state list. `issue` is therefore no longer a state: a pre-event rejection is a transition back to `editable` with `review_outcome = 'issue'`, and an event-day problem is `checked` with `review_outcome = 'issue'`.

### Transitions

Player (entry must be linked to the caller; everything in this block also requires the submission window: event active, `submissions_close_at` null or in the future):

- `editable → submitted` — "Submit for review". Stamps `submitted_at` and stores a `change_summary` diff against the list as the judge last saw it (below).
- `submitted → editable` — only in an event's `at_deadline` lock mode (below): there the window is the registration period, so a not-yet-reviewed submission unlocks self-service. In the default `on_submit` mode, submitting _is_ the delivery (TR 401.3), so this transition is judge-only and the player files an unlock request instead.
- unlock request — the player cannot unlock a locked entry themselves (an `approved` one never; a `submitted` one not in `on_submit` mode); they file a request (`unlock_requested_at`). A judge grants it (transition to `editable`) or declines it (clears the request). The player can cancel their own pending request.
- An entry still `editable` when the deadline passes **auto-submits as-is**: the lazy settle (run when the entry or its event is next loaded) moves it to `submitted` with `submitted_at = submissions_close_at`. Nobody misses the event over a forgotten button; the judge sees exactly what existed at the deadline.

Judge (any state reachable below, deadline does not bind judges):

- `submitted → approved` — approve. Sets `review_outcome = 'ok'`, clears the pending diff.
- `approved → submitted` — revoke approval.
- `submitted | approved → checked` — the event-day check, with an explicit outcome (`ok` or `issue`).
- `checked → submitted` — re-open a check.
- `submitted | approved | checked → editable` — hand the list back to the player: either a rejection ("fix this", `review_outcome = 'issue'`, usually with a `player_message`) or a plain unlock (granting an unlock request, or the after-deadline venue correction). Requires a linked player; for an unclaimed entry there is nobody to edit, so a judge instead records `review_outcome = 'issue'` on the spot without a transition.
- `editable → submitted` — lock a list on the player's behalf (venue: "I'm done").

Provider (push, **provider always wins** — edit-takeover is removed):

- A push with a changed list puts the entry in `submitted` with the new list, from any state — including `editable` (discards the player's in-progress edit) and `approved`/`checked` (invalidates the review, storing the diff as today). `list_owner` and `provider_push_ignored_at` are dropped; the ignored-push bookkeeping goes with them.
- An identical re-push refreshes identity fields and leaves the state untouched.
- `withdrawn: true` moves the entry to `withdrawn` from any state; a later push without the flag returns it to `submitted` (the pre-withdrawal state is not preserved — the push _is_ a fresh submission).
- The `openrift:` external-id namespace stays reserved: a provider still cannot address a self-submitted entry, because the unique key would collide, not because of ownership.

Token submission (the ADR-026 shared link) is unchanged in spirit: submitting through the link is an explicit "send for review", so a fresh entry is born `submitted` (not `editable`). When the caller already has a linked entry, the link replaces its list only while that entry is `editable` — or `submitted` in `at_deadline` mode, where that is the composed self-service unlock-replace-resubmit. Any other state sends the player to their deck page to request an unlock.

### The list lock mode

TR 401.3 leaves one judgment call to the organizer: when does a list count as "registered and delivered"? A per-event `list_lock_mode` answers it:

- **`on_submit`** (default): submitting is the delivery. From that moment every change goes through a judge — the player's unlock action files a request even on a never-reviewed `submitted` entry, and the token link refuses to replace one.
- **`at_deadline`**: the submission window is the registration period and delivery happens when it closes. Until then a not-yet-reviewed submission unlocks self-service; `approved` stays judge-gated either way. For casual leagues where pre-deadline corrections are routine.

The default is the strict mode: the feature exists for tournament judging, and rules-correct out of the box beats surprising an organizer with a violation.

### Officials never see an editable list

The flip side of TR 401.3: a list the player is still working on must not be readable by a competition official, or its delivery could be argued to have already happened. While an entry is `editable`, every judge-facing surface withholds the deck content — the checker shows the entry's identity, state, and link status but no cards, no advisories, no stats; the event list shows no copy or progress counts; the card-repair and tick endpoints reject the entry; the event-wide re-resolve skips its lines. The provider feed was never able to read lists (the push API is write-only), so the boundary is entirely about OpenRift's own judge surfaces. The content becomes visible the moment the entry reaches `submitted` — including via the deadline auto-submit, which is precisely the registration happening.

### The diff baseline

`change_summary` now means "changed since a judge last saw it". A jsonb `pre_edit_lines` snapshot holds the list as it stood when it left a judge's hands: written on every transition into `editable` (and on a `submitted` self-unlock only if not already set, so repeated unlock/submit cycles keep the original baseline), cleared on `approved`/`checked`. Submitting diffs the new list against the snapshot. Provider pushes keep their existing one-shot diff (old stored lines vs push).

### Consequences

- Good, because the original ask holds by construction: a submitted list cannot change without a visible transition, and an approved list cannot change without a judge.
- Good, because pre-event screening becomes a first-class judge action with its own state, actor, and timestamp, and the event-day check keeps its meaning.
- Good, because "provider always wins" replaces split ownership with one sentence; the judge-facing "player-owned / push ignored" vocabulary disappears.
- Good, because the player UI can say exactly where a deck stands ("Submitted", "Approved", "Checked") instead of deriving it from three booleans.
- Bad, because a provider re-push can discard a player's in-progress edit or a pending unlock request without asking. Accepted: the provider is the organizer's system of record, and the entry's diff shows what the push changed.
- Good, because TR 401.3 holds by construction in the default mode: a delivered list never changes without an official, and an undelivered list is never readable by one.
- Bad, because fixing a submitted deck now takes a judge in the default mode (request, grant, edit, resubmit). Accepted: that is what the rule demands; organizers who want one-tap corrections pick `at_deadline`.
- Bad, because hiding editable lists means a judge cannot glance at a work in progress to help a player. Accepted: that glance is exactly what the rule forbids; the judge can always ask the player to submit first.
- Bad, because `withdrawn` overwrites the prior state, so un-withdrawing an `approved` entry lands in `submitted` and needs re-approval. Accepted: re-review after a withdrawal round-trip is the safer default anyway.
- Bad, because the auto-submit at the deadline can send a half-finished edit for review. Accepted by explicit choice: a judge reviewing a rough list beats a player missing the event.

## Schema sketch

```sql
-- ALTER TABLE deck_check_entries
--   ADD COLUMN state text NOT NULL DEFAULT 'submitted'
--     CHECK (state = ANY (ARRAY['editable','submitted','approved','checked','withdrawn'])),
--   ADD COLUMN review_outcome text
--     CHECK (review_outcome IS NULL OR review_outcome = ANY (ARRAY['ok','issue'])),
--   ADD COLUMN approved_by text,
--   ADD COLUMN approved_at timestamptz,
--   ADD COLUMN unlock_requested_at timestamptz,
--   ADD COLUMN pre_edit_lines jsonb;
-- Backfill: withdrawn_at IS NOT NULL -> 'withdrawn';
--   check_status 'checked' -> ('checked','ok'); 'issue' -> ('checked','issue');
--   'unchecked' -> ('submitted', NULL).
-- ALTER TABLE deck_check_entries
--   DROP COLUMN check_status, DROP COLUMN list_owner, DROP COLUMN provider_push_ignored_at;
-- ALTER TABLE deck_check_events
--   ADD COLUMN list_lock_mode text NOT NULL DEFAULT 'on_submit'
--     CHECK (list_lock_mode = ANY (ARRAY['on_submit','at_deadline']));
```

`withdrawn_at` stays as the informational timestamp next to the `withdrawn` state. `submissions_close_at` keeps its role as the player-side boundary in both lock modes.

## Will Not Be Built

- **A pending-revision proposal store.** The unlock-edit-resubmit cycle plus the baseline diff covers "change proposals a judge approves" without a second list per entry.
- **A per-event opt-out of the lifecycle.** Every event gets the same states; an organizer who wants ADR-026's looseness simply leaves entries unreviewed until event day.
- **Judge-initiated withdrawal.** _Superseded 2026-06:_ judges can now withdraw an entry and restore it to `submitted` through the same state endpoint, mirroring the provider's flag exactly (same fields, so a later push interacts with a judge withdrawal identically), and admins can hard-delete an entry. The original decision kept withdrawal as the provider's signal only.
- **Notifications on transitions.** "Your deck was approved / sent back" notifications wait for a notification channel, same as ADR-026's link notifications.
- **Preserving the pre-withdrawal state.** Un-withdrawing lands in `submitted`, always.

## Confirmation

Integration tests to exercise, beyond updating ADR-025/026's suites to the new fields:

- A player can edit the list only in `editable`; a `PUT` against a `submitted`, `approved`, `checked`, or `withdrawn` entry is rejected.
- Submit stores the diff against the last-reviewed baseline; unlock-edit-resubmit on a previously `approved` entry shows the judge exactly what changed since approval; repeated unlock/submit cycles keep the original baseline until a judge reviews.
- In `on_submit` mode (the default), the player's unlock action on a `submitted` entry files a request instead of unlocking, and the token link refuses to replace a submitted list; in `at_deadline` mode the same unlock is immediate. Unlock from `approved` only files a request in both modes. A judge can grant a request (entry becomes `editable`, request cleared) or decline it (request cleared, state kept), and the player can cancel.
- While an entry is `editable`, the judge entry payload carries no cards, advisories, or stats; the event list carries no copy or progress counts for it; card-repair and tick endpoints reject it; re-resolve skips its lines. All of it reappears once the entry is `submitted`.
- After `submissions_close_at`, every player write (edit, submit, unlock, request, token submission) is rejected; a judge can still approve, check, and hand the entry back to the player.
- An entry left `editable` past the deadline reads as `submitted` once settled, with `submitted_at = submissions_close_at`.
- Judge transitions enforce the matrix (no approve from `editable`, no check from `editable`/`withdrawn`, `checked` requires an outcome) and record the acting judge; sending an unclaimed entry to `editable` is rejected while recording an issue on it in place works.
- A provider push with a changed list lands the entry in `submitted` from every state, replaces the list even after the player edited it, and clears a pending unlock request; an identical push keeps `approved`/`checked` untouched; the withdrawal round-trip ends in `submitted`.
- Existing rows migrate: `checked` → (`checked`, `ok`), `issue` → (`checked`, `issue`), `unchecked` → (`submitted`, null), withdrawn rows → `withdrawn`.

## More Information

- **ADR-025 (Deck Check for Tournament Judges).** The content-hash idempotence, the card-line storage, ticks, and the push contract stand. The single `check_status` verdict is superseded by the state + outcome pair; "a stale check must never pass a changed deck" still holds, now via state regression instead of a status reset.
- **ADR-026 (Player Self-Service for Deck Checks).** Account linking, player access scoping, the submission token, and the player surface all stand. Superseded: the "edit gate: reuse re-import invalidation" decision (edits now require `editable`), the edit-takeover/`list_owner` model (provider always wins), and the "no separate pending-revision approval workflow" stance to the extent the unlock request is one. The reserved `openrift:` namespace stays.
- **Tournament Rules 401.3.** "Once a decklist has been registered and delivered to a competition official, it can't be changed." The `on_submit` lock mode and the editable-list visibility boundary exist to satisfy it; `at_deadline` mode is the organizer asserting that delivery happens at the close of the registration window.
