---
status: accepted
date: 2026-06-12
---

# ADR-028: Free-Text Riot ID on the User Profile

## Context and Problem Statement

Riftbound players are identified at tournaments by their Riot ID (`gameName#tagLine`). OpenRift already stores a free-text `riot_id` per deck-check entry (ADR-025, renamed from `handle` in migration 151): provider pushes carry it, and judges read it during checks. But the user account itself has no Riot ID, so a self-submitted entry is created with `riot_id = NULL` (ADR-026 had no source for it), and a player must hope the organizer's site collected it.

The proper fix is RSO (Riot Sign On), Riot's OAuth2/OIDC provider, which would link a verified Riot account the same way Google and Discord are linked today. RSO access requires a production API key plus a separate RSO application on top. We applied for the production key long ago; the wait times are long and the timeline is entirely Riot's. The question is what to do in the meantime.

## Decision Drivers

- **Self-submitted deck-check entries should carry a Riot ID.** Judges match entrants against pairing software by Riot ID; an empty field means manual cross-referencing at the event.
- **Enter it once, not per event.** A player's Riot ID is stable account data, not per-submission data.
- **Don't paint RSO into a corner.** Whatever we store now must be cheap to verify, supersede, or discard once RSO access is granted.
- **Don't imply verification we don't have.** A free-text field must not look like a linked account next to the real OAuth connections on the profile.

## Considered Options

1. **Wait for RSO.** No Riot ID on the account until the verified integration lands.
2. **Free-text Riot ID on the profile now, RSO verification layered on later.**
3. **Keep Riot IDs per-entry only.** Ask for it in the self-submission form each time.

## Decision Outcome

Chosen option: **free-text Riot ID on the profile now** (option 2). Waiting (option 1) blocks a real judge pain point on an approval queue we don't control. Per-submission entry (option 3) collects the same unverified string with more friction and no single place to correct a typo.

- **Storage: one nullable `users.riot_id` text column.** No separate table, no verification metadata yet. The value is self-reported and treated exactly like the provider-supplied `riot_id` on deck-check entries: display data, never an identity key. Account identity stays on `users.id` / verified email (ADR-026's auto-match is untouched).
- **Editing: better-auth `additionalFields`, profile Account Info section.** The field rides `authClient.updateUser` like the display name, with the same server-side validation-hook pattern. It lives next to name and email under Account Info, not under Connected Accounts, precisely because it is not a connected account.
- **Validation: soft shape check, shared between client and server.** Trimmed; empty clears to `NULL`; otherwise it must look like `gameName#tagLine` — 3–16 characters, a `#`, then a 3–5 character tag (Riot's published constraints). This catches "forgot the tag" typos without pretending to verify ownership.
- **Consumption: self-submission copies it.** `createSelfSubmittedEntry` populates the entry's `riot_id` from the submitter's profile at creation time, the same way it already copies name and email. The copy is a snapshot, consistent with ADR-025's "the entry is frozen at submission" rule; a later profile edit does not rewrite past entries.
- **RSO later: verify, don't replace.** When RSO access is granted, linking adds the PUUID as the stable identifier (Riot IDs are renameable) plus a verified-at timestamp, and the profile field becomes the RSO-synced display value. The free-text column is exactly the display slot that flow needs, so nothing built here is thrown away. The RSO integration gets its own ADR when it is real.

### Consequences

- Good, because self-submitted entries stop arriving without a Riot ID, with zero per-event friction for the player.
- Good, because the RSO path stays clean: PUUID and verification land as additive columns, and the free-text value becomes the synced display string.
- Bad, because the value is unverified: a player can typo or impersonate. Bounded: it is display data on surfaces a judge already treats as self-reported (provider pushes are no more verified), and it gates nothing.
- Bad, because the soft format check may reject legitimate edge cases if Riot's naming rules drift. Bounded: the rule is one regex in `@openrift/shared`, and the field can be cleared.
- Neutral, because existing deck-check entries are untouched; only entries created after this change pick the profile value up.

## Will Not Be Built (here)

- **RSO / verified linking.** Blocked on Riot's production-key and RSO approvals; separate ADR when granted.
- **Riot ID on other surfaces.** No display on shares, trades, or group rosters; the deck-check pipeline is the only consumer until something else earns it.
- **Backfill of existing entries.** Past entries keep whatever the provider or judge recorded.
- **Riot ID as a match key.** Auto-linking entries by Riot ID would let an unverified string claim someone else's entry; linking stays on verified email or judge action (ADR-026).

## Confirmation

- Updating the profile with a valid `gameName#tagLine` persists it; an invalid shape is rejected by the server hook; an empty submission clears the column.
- A self-submitted entry created by a user with a profile Riot ID carries it; one created without stays `NULL`; editing the profile afterwards does not change the existing entry.
- Provider-fed entries and the ingest contract are byte-for-byte unaffected.
