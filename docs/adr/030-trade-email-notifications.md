---
status: accepted
date: 2026-06-16
---

# ADR-030: Transactional Email Notifications for Trades

## Context and Problem Statement

ADR-019 built the in-app trade-execution loop (request, reserve, complete, sync) and a polling-fed notification **bell**, but deliberately deferred email: _"Email and web push. In-app polling only for v1. Revisit if 'I missed a request' becomes a real complaint, a service worker + Web Push, or transactional email, can layer on later without schema change."_ ADR-013 likewise listed _Notifications_ under _Deferred / Out of Scope_.

The gap that motivates this ADR: the bell only works while a member has the app open. Two situations slip through:

1. **A new match appears** (someone in your group now has a card you want) and you never come back to notice it.
2. **Someone requests a trade with you** and the request can lapse at its 24h expiry before you ever open the app.

This ADR adds **transactional email** on top of the existing model: a **daily digest of new matches** and an **instant email when a trade is requested**. Both are per-user with one-click unsubscribe: the digest is opt-in, the request email is on by default. It adds no new delivery infrastructure beyond the SMTP sender that already exists for auth, and no schema change to the trade tables.

### Relationship to ADR-019 and ADR-013 (supersession)

This ADR **reverses exactly one deferral** in each of two prior ADRs and nothing else:

- ADR-019 _Deferred → Email and web push_: partially reversed. We add **transactional email** (digest + instant request). We still do **not** add web push, a service worker, or websocket/SSE delivery.
- ADR-013 _Deferred → Notifications_: already partly reversed by ADR-019's bell; this ADR extends it to email.

Everything else stands. The match query, the trade state machine, the bell, and the `card_trades` / `card_trade_copies` tables are unchanged. Matches stay computed live and unmaterialised (ADR-013).

## Decision Drivers

- **Reach people who aren't in the app.** The whole point is delivery when the bell can't help.
- **Right default per channel.** No email-preference concept exists today. The product owner's call: the **daily digest is opt-in (default off)**, but the **trade-request email is on by default**, because a request is time-sensitive (it expires in 24h) and high-signal, so the cost of missing it outweighs the cost of an occasional email. Both honour an unsubscribe link and only mail verified addresses. Dedup is watermark-only.
- **Reuse existing primitives.** SMTP sender, `croner` + `runJob` + `job_runs` watermark, `user_preferences` JSONB, the live match query, and the `createTrade` service. No new tables, no new transport.
- **Never let mail break a trade.** A request must still succeed if SMTP is down. Email send is best-effort and outside the trade transaction.
- **Hold email volume down.** Matches are batched into one calm daily email. Instant mail is reserved for the one event that is both rare and time-sensitive: a trade request.

## Considered Options

The load-bearing forks (resolved with the product owner):

1. **Match-notification trigger**: periodic digest cron _(chosen)_ · per-event email · in-app only (status quo).
2. **Digest cadence**: daily _(chosen)_ · hourly · weekly.
3. **Default per channel**: digest opt-in (off) + request on-by-default _(chosen)_ · both opt-in (off) · both on-by-default.
4. **New-match dedup**: global watermark in `job_runs.result` _(chosen)_ · per-match dedup table · per-user watermark column.
5. **Trade-request notification**: instant email at request creation _(chosen)_ · fold into the daily digest · in-app only.

The two channels get **separate toggles** (not one shared switch), forced by their different defaults: the digest is off until turned on, the request email is on until turned off.

## Decision Outcome

Add two notification paths, each gated by its own per-channel preference on `user_preferences` (digest opt-in, request on by default) and both carrying an unsubscribe link:

- **Daily match digest**: a new `email.trade_match_digest` cron (modelled on the existing `discord.post_changelog` job) reads a **global watermark** from its last `job_runs.result`, finds matches whose `matchedAt > watermark` across all opted-in users, groups them by recipient, sends one email per user, and writes `now()` back as the new watermark.
- **Instant trade-request email**: `createTrade` (`apps/api/src/services/card-trades.ts`), after the trade row commits, emails the non-initiator. Best-effort, outside the transaction.

No change to the trade tables, the match query, or the bell. The only schema touch is extending the `user_preferences` JSONB blob.

### Consequences

- Good: reuses the SMTP sender, the cron/`runJob`/`job_runs` watermark pattern, and the live match query. Net new code is one cron service, one email-rendering helper, one preferences field, one unsubscribe route, and one call site in `createTrade`.
- Good: the digest's "new since" filter is one `WHERE matchedAt > $watermark` clause on an already-audited query; no index or materialisation needed.
- Good: no migration backfill either way. The digest defaults off (absent key reads as off), and the request email defaults on by treating an absent key as on (gate `!== false`), so existing users get the right behaviour with no data change.
- Bad: the request email reaches users who never opted in (it is on by default). This is the deliberate trade-off for not missing a 24h-expiry request; mitigated by one-click unsubscribe in every email and by trade requests being genuinely low-volume (human-initiated, at most one live trade per pair + printing).
- Each send path also has an admin **kill-switch feature flag** (`disable-trade-request-email`, `disable-trade-match-digest`) so a bug can be stopped without a deploy. They are `disable-*` flags, default-off: absent or off → send (the ADR behaviour above); toggle on → stop. Checked at the send site (`featureFlags.isEnabled`); per-user preferences and unsubscribe still apply on top.
- Bad: the global watermark can re-fire a match if a component timestamp bumps (re-share, copy re-add). Accepted for v1 (see _Watermark semantics_); upgradeable to a dedup table without schema change to trades.
- Bad: `sendEmail` must now reach the service layer, a small dependency-wiring change in `deps.ts` / `index.ts`.
- Bad: two new user-facing email types to keep on-brand and accessible. Mitigated by a single shared HTML layout helper.

## Design Decisions

### Opt-in preference

`user_preferences.data` (JSONB, `apps/api/src/repositories/user-preferences.ts`, 8192-char cap) gains an `emailNotifications` object. Extend `UserPreferencesResponse` (`packages/shared/src/types/api/preferences.ts`) and the `PATCH /preferences` merge:

```ts
emailNotifications?: {
  tradeMatches?: boolean;   // daily digest of new matches; default OFF  (gate: === true)
  tradeRequests?: boolean;  // instant email on a trade request; default ON (gate: !== false)
};
```

Two sub-toggles with **different defaults**, encoded entirely in the read-side gate, not the data:

- **`tradeMatches`** (digest) is opt-in: send only when the value is explicitly `true`.
- **`tradeRequests`** (instant) is on by default: send unless the value is explicitly `false`. An absent key therefore means "on", which is what gives every existing user the request email with no backfill.

Keeping the asymmetry in the gate (and leaving the JSONB default blob untouched) means no migration: existing rows simply read `tradeRequests` as on and `tradeMatches` as off. The profile page's existing "Trading" preferences section (`apps/web/src/routes/_app/_authenticated/profile.lazy.tsx`) gains a small "Email notifications" group with two switches; the request switch renders **on** when the key is absent.

### Daily match digest

A new cron `email.trade_match_digest`, registered alongside the others in `apps/api/src/index.ts` (slot in `apps/api/src/cron-jobs.ts`), schedule from a new `CRON_TRADE_DIGEST` config entry (default once daily, e.g. `0 8 * * *`):

1. **Read watermark.** `repos.jobRuns.findLatestForResume("email.trade_match_digest")`, extract the stored `lastRunAt` (same pattern as `extractWatermark` for the changelog job). First run with no prior watermark notifies nothing and just records `now()` (avoids a launch-day blast of every pre-existing match).
2. **Find new matches.** Add an optional `sinceTimestamp?: Date` to `recentIncomingMatchesForFeed` (`apps/api/src/repositories/friend-group-matches.ts`), applying `WHERE matchedAt > $since`. For v1, loop over opted-in users and their group memberships calling this per `(user, group)`; the result already nets out reserved copies. (A single batch query grouped by viewer is the scale-up path if the loop gets expensive; not needed at friend-group scale.)
3. **Group by recipient, send one email each.** Only users with `emailNotifications.tradeMatches === true` and a verified email (`users.email_verified`). One email aggregates all of that user's new matches across all their groups: per group, the cards now available and from whom (counterparty name + nickname). Deep-link each group into its Trading tab.
4. **Write watermark.** Store `{ lastRunAt: <run start time> }` in the job result so the next run resumes from it. Use the **run start** time, not end, so matches created mid-run aren't skipped (at worst re-sent next day, acceptable under watermark-only).

The cron carries `repos`, `log`, `config`, and `sendEmail` via the same `runJob({ repos, log }, kind, "cron", fn)` wrapper the other jobs use.

### Instant trade-request email

In `createTrade` (`apps/api/src/services/card-trades.ts:165-186`), after `reloadDto()` returns the committed DTO:

- **Recipient** = the non-initiator: `created.initiator === "giver" ? receiverUserId : giverUserId`. The DTO from `tradeDtoBaseQuery` already carries both parties' `name` and `email`, so no extra query.
- **Gate**: send when the recipient's `emailNotifications.tradeRequests !== false` (on by default) and their `email_verified` is true.
- **Content**: "{initiator} wants {card}" (receiver-initiated request) or "{initiator} offers you {card}" (giver-initiated offer), card name resolved server-side from `printingId`/`cardId` the same way the DTO layer already does, plus a deep link to the group's Trades tab and the 24h-expiry note.
- **Best-effort**: wrap in try/catch, log on failure, never rethrow. The email is **after commit and outside the trade transaction**, so a mail failure cannot roll back or 500 the trade. Unlike auth OTP (where a failed send must surface), a trade request must always succeed in-app, the bell remains the source of truth.

Only the **request** transition emails instantly in v1. The same hook pattern extends to accept / decline / complete later; deliberately deferred to keep volume down (see _Will Not Be Built_).

### Wiring `sendEmail` into the service layer

`sendEmail` is created in `index.ts:85` and currently passed only to `createAuth`. Thread it into the services factory (`apps/api/src/deps.ts`) so trade services can call it, mirroring how `repos` is injected. The trade route handler already resolves `services` via `c.get("services")`, so no route signature changes, the dependency travels with the service object.

### Email rendering and unsubscribe

- **Shared layout helper.** Today each email is hand-built inline (`auth.ts`). Add one small `apps/api/src/emails/` helper that wraps subject + body in a consistent OpenRift HTML shell (header, content, footer with the unsubscribe link). Both new emails and, optionally later, the auth emails can use it. Plain inline-styled HTML, no template engine.
- **Links** use the existing base URL config (`BETTER_AUTH_URL`) so dev/preview/prod resolve correctly (per the no-hardcoded-URL rule).
- **Unsubscribe.** A new unauthenticated `GET /api/v1/unsubscribe?token=...` route. `token` is an HMAC of `(userId, channel)` signed with an app secret, `channel ∈ {tradeMatches, tradeRequests}`. The handler verifies the signature and flips that one preference to `false`, then renders a plain confirmation page. No new table, the token is self-describing and stateless. Every notification email includes its channel's unsubscribe link in the footer.

### Watermark semantics (the v1 trade-off)

`matchedAt` is `greatest(seller_shared_at, buyer_shared_at, copy_created_at, wish_entry_created_at, trade_entry_created_at)` (`friend-group-matches.ts:194`). A `WHERE matchedAt > watermark` filter therefore re-surfaces a match if any component bumps (e.g. a member re-shares a list), so the digest can occasionally re-notify a match the user already saw. Chosen anyway for v1: zero new state, one clause, and at daily cadence the worst case is a familiar card showing up again, not a flood. If re-fires become a real annoyance, add a `trade_match_notifications (user_id, counterparty_user_id, printing_id, notified_at)` dedup table and check against it before sending. This is additive and needs no change to the trade tables or this ADR's decisions.

## Resolved Details

- **Cadence**: daily digest. **Defaults**: digest off (opt-in), request email on (opt-out). **Dedup**: global watermark, watermark-only.
- **Verified email required** for both channels (no mail to unverified addresses).
- **First digest run** with no prior watermark sends nothing and records `now()`.
- **Mail failure** never fails a trade or a cron run as a whole; per-recipient failures are logged and the run continues.
- **Two separate toggles** (`tradeMatches`, `tradeRequests`), not a single shared switch: their differing defaults (off vs on) make one switch impossible to represent honestly.
- **Suggested changelog entry** (implementing PR, user-facing): `feat: Get an email when someone requests a trade with you, so you don't miss a request before it expires (turn it off in your profile if you'd rather not). You can also opt in to a daily digest of new matches in your groups`.

## Will Not Be Built

- **Web push / service worker / websocket / SSE.** Email only on top of the existing polling bell.
- **Instant email for accept / decline / complete / expire.** v1 emails only the trade **request**; the bell still covers the rest. Extendable via the same hook later.
- **Per-event match email.** Matches are batched into the daily digest, never one mail per match.
- **A template engine.** Inline-styled HTML via one shared helper.
- **Configurable per-user cadence.** Daily is fixed for v1; the only per-user control is on/off per channel.

## Deferred / Out of Scope

- **Match-dedup table.** Ship watermark-only; add the dedup table only if re-fires prove annoying.
- **Hourly / weekly digest options.** Single daily cadence for now.
- **Digest batch query.** Per-`(user, group)` loop for v1; a single grouped-by-viewer query is the scale-up path if needed.
- **Reusing the shared layout for auth emails.** Optional cleanup, not required here.

## Confirmation

Integration tests (`apps/api`, temporary DB via `setupTestDb()`, dropped in `afterAll`, run from main not a worktree):

- The digest cron with no prior watermark notifies nobody and records a watermark.
- A match created after the watermark is included for the wisher; one created before is not; the email groups by recipient and by group.
- Only users with `emailNotifications.tradeMatches === true` and `email_verified` receive the digest; opted-out and unverified users are skipped.
- Reserved copies are excluded from digest matches (inherited from the match query).
- The watermark advances to the run-start time and the next run resumes from it.
- `createTrade` sends one request email to the non-initiator by default (absent preference) and when `tradeRequests === true`, but **not** when `tradeRequests === false` or the recipient's email is unverified; an SMTP failure is swallowed and the trade still returns 201.
- The request email's recipient is the non-initiator for both `giver`- and `receiver`-initiated trades.
- `GET /unsubscribe` with a valid token flips exactly the named channel to false; a tampered or wrong-channel token is rejected and changes nothing.

Unit tests (`apps/web`, vitest): the preferences merge for the new `emailNotifications` keys (`null` resets, partial merge preserves the sibling key); the on/off gate derivation (digest is on only when `tradeMatches === true`; request is on unless `tradeRequests === false`, including the absent-key case); and the profile toggles' wiring, with the request switch rendering on when the key is absent. Any new store/hook/util gets a `*.test.ts` per `docs/contributing.md`.

The implementing PR adds the user-facing `feat:` changelog entry above.

## More Information

- ADR-019 (In-App Trade Execution): supersedes its _Deferred → Email and web push_ item for transactional email; the bell, state machine, and tables are unchanged.
- ADR-013 (Friend Groups for Trading Discovery): the live, unmaterialised match query that the digest filters by `matchedAt`.
- ADR-017 (Trade Preferences): informational prefs on match rows; not part of email content.
- Key code: SMTP sender `apps/api/src/email.ts`; auth email call site `apps/api/src/auth.ts`; cron registry `apps/api/src/cron-jobs.ts` + wiring in `apps/api/src/index.ts`; watermark pattern in the `discord.post_changelog` job; match feed `apps/api/src/repositories/friend-group-matches.ts`; trade creation `apps/api/src/services/card-trades.ts`; preferences `apps/api/src/repositories/user-preferences.ts` + `packages/shared/src/types/api/preferences.ts`.
  </content>
