---
status: accepted
date: 2026-05-29
---

# ADR-019: In-App Trade Execution for Friend Groups

## Context and Problem Statement

ADR-013 gave friend groups a discovery surface: a live match view that intersects a member's wishlist with co-members' tradelists. It deliberately stopped there. ADR-013 states, verbatim, that _"Trade execution is intentionally **not** in the system... no proposals, counter-offers, or a two-sided ledger... This is a deliberate, permanent choice, not a deferral,"_ and lists both **Trade execution** under _Will Not Be Built_ and **Notifications** under _Deferred / Out of Scope_.

Use has shown the gap. Members find a match, then have to leave the app entirely (Discord, in person) to actually do anything, and there is no way to signal interest, nothing stops two people from both chasing the same single copy, and after a swap each person has to remember to hand-edit their own collection and lists. The request that motivates this ADR: _"I want this card"_ should become a notification for the counterparty. On accept the copy is reserved for that person and hidden from everyone else. After the trade is acknowledged, the affected cards leave/enter each side's collection, wishlist, and tradelist.

This ADR adds a minimal trade-execution loop on top of the existing discovery model: request → reserve → acknowledge → (proposed) sync. It does not add negotiation, payments, or a two-sided ledger.

### Relationship to ADR-013 (supersession)

This ADR supersedes two specific stances in ADR-013 and nothing else:

- ADR-013 _Will Not Be Built → Trade execution_: reversed. We now build a single-card request/reservation/acknowledge loop. We still do not build counter-offers, a negotiation thread, or payment.
- ADR-013 _Deferred → Notifications_: reversed. We add a persistent, pull/poll-based notification surface (a global bell) for trade activity.

Everything else in ADR-013 stands: groups, roles, opt-in list/collection sharing, the live match query, and the existing invite/request badges are unchanged. The match query gains exactly one new filter (reserved-copy exclusion). No existing column changes meaning.

> **Amendment (2026-08-03).** Two rules stated below no longer hold. `initiator` splits `pending` into an offer, which commits the giver's supply, and a request, which still reserves nothing. And a sweep now closes the pending trades a giver's supply can no longer cover instead of leaving them to lapse. Accept also gained an optional copy picker, `moveCopies` gained a guard, and the viewer's live trades gained an aggregated read model. The sections below are superseded wherever they conflict with this block.
>
> 1. **An offer commits supply, a request does not.** "A pending request reserves nothing" (_Trade lifecycle_) holds only for receiver-initiated rows. Those are bids: they pin no copies, so several members may still ask for one card and the giver picks. A giver-initiated row is an offer, a commitment the giver made, so `assertSupplyAvailable` (`apps/api/src/services/card-trades.ts`) counts live offers against the giver's free supply. Creating a trade and resizing a pending request both run that check. Accepting deliberately does not, because the pins settle the race there and a trade must not be blocked by its own offer. One knock-on effect is intended: once the last copy is out on an offer, a new request for it is refused too, since the supply really is committed.
> 2. **Unfillable pending trades are swept, not left to expire.** `autoCancelUnfillablePendingTrades` closes every still-`pending` trade of one giver and printing that the current supply can no longer fill. The threshold is the trade's own `quantity`, not zero, so a request for 2 against 1 remaining copy dies at once rather than sitting out its 7d TTL. It runs inside the caller's transaction on four paths: accepting a competing trade, disposing copies, moving copies, and unsharing a trade list. Offers are judged first (oldest first), then requests against whatever the surviving offers left, since requests never consume from each other. This replaces _Reservation semantics_' "they simply expire at 7d or become un-acceptable once the stack is exhausted" and the _Resolved Details_ promise of "no proactive hooks into the unshare / remove-copy paths". The vanished-basis auto-cancel on accept is now one caller of this sweep.
> 3. **Allocation is by copy id, not by count.** `claimCopiesForOffers` hands each live offer copy ids drawn from the group that offer lives in, oldest offer first. Both `assertSupplyAvailable` and the sweep call it, so creating a trade and sweeping for dead ones can never disagree about what is still free. A global count of outstanding offers was wrong: a giver who shares different copies with different groups would see a second offer refused because the first one, drawing on copies this group cannot even see, had already eaten the count.
> 4. **The giver may choose which physical copy gets pinned.** Accept takes an optional `copyIds`, exactly `quantity` distinct ids, all of which must still be in the candidate set that survived the row lock. Only the giver may send it, so only on a receiver-initiated request, where the giver is the accepting party. Omitted, the server pins plainest first: `copyPinWeight` (`apps/api/src/lib/card-trade-presenters.ts`) mirrors the web app's move-source weighting, so a graded, noted, altered or linked copy stays with its owner while a plain one is still on the table. `GET /api/v1/trades/{id}/copy-options` (giver-only, pending-only) reads the same reservable supply the accept pins from and returns the candidates in that default order, plus a `choiceMatters` flag. It is true only when there are more candidates than the trade needs and at least two of them differ in metadata a person would care about, so the client never prompts over a stack of identical copies.
> 5. **Pins outlive completion, and cancelling is not the remedy.** A completed trade keeps its `card_trade_copies` rows until the giver applies or skips their sync. Cancel accepts only `pending` or `reserved`, so those pins cannot be cleared by cancelling. The dispose guard now reads the owning trade's status and names the remedy that exists: cancel the trade for a live pin, resolve or skip the sync for one a completed trade still holds. The consequence stands unfixed. A giver who never resolves their sync keeps those copies out of every match view indefinitely, and the reservation TTL under _Deferred / Out of Scope_ is still deferred.
> 6. **`moveCopies` is no longer unguarded.** A reserved copy still moves freely between the owner's own collections, but moving it into a group collection now 409s. Reservations pin personal copies, and the whole group would otherwise see a `reserved` flag on a copy that is not theirs. The rows are locked before the check so a concurrent accept serializes against the move. This supersedes "`moveCopies` stays unguarded" in _Resolved Details_ and the matching _Confirmation_ bullet.
> 7. **An aggregated live-trade read model.** `GET /api/v1/trades/live-by-printing` returns the viewer's live trades across every group, summed to one row per (printing, role, phase). Live means `pending`, `reserved`, or `completed` with the viewer's own side unsynced. `phase` follows `initiator` rather than the viewer: `asked` for a receiver-initiated pending row, `offered` for a giver-initiated one, then `reserved` and `traded`. That ladder runs least to most committed and is part of the contract, because a surface with room for one marker per card collapses along it. The rows deliberately carry no counterparty, group, or user id. A card browser only needs to know something is in flight, and leaving the parties out keeps an in-progress trade off a surface that is easy to shoulder-surf.
> 8. **Uncovered supply drops.** Three paths still take supply away without running the sweep: deleting a trade list, removing a manual copy entry from one, and editing a dynamic trade rule. The list router has no trade awareness at all. Trades left dead by those edits keep the old behavior, failing at accept or lapsing at the 7d TTL.

> **Amendment (2026-08-10).** Fork #3 chose "either party marks traded", and the Consequences bullet defending it ("Mitigated by sync being proposed, not forced") no longer holds. Givers pressed "Mark as traded" as soon as they had handed a card over or posted it, which drove the trade to a terminal state before the swap had happened, with no way back: cancel accepts only `pending` and `reserved`. The mitigation protected each side's data and left the trade record itself wrong. The button asked one person to assert a two-party fact, so it is deleted rather than gated. _Trade lifecycle_, _Post-trade sync_, _Authorization_, the state diagram, the _Per-group Trades tab_ actions, and the _Two-party completion confirmation_ entry under _Will Not Be Built_ are superseded wherever they conflict with this block.
>
> 1. **Each side settles its own half, immediately, from `reserved`.** There is no completion step and no waiting on the other party. The giver's action is "handed over", the receiver's is "got them", and each is a fact that party alone knows and is always right about. Both keep the existing apply/skip pair, worded as "handed over, remove N from [collection]" against "handed over, leave my collection", and "got them, add to [target]" against "got them, don't add". Skipping still settles that side; it declines only the data change. `applyTradeSync` / `skipTradeSync` (`apps/api/src/services/card-trades.ts`) accept `reserved` as well as `completed`, and `completeTrade` is gone along with its route.
> 2. **`completed` is derived, not asserted.** The second settle promotes the row and stamps `completed_at`, with `last_actor_user_id` set to whoever settled second. Nothing else writes the status. `actionNeeded` collapses `complete` and `apply-sync` into one `settle`, giving `accept-or-decline | cancel | settle`, and the viewer-facing state table drops from eight rows to six. A `reserved` trade the viewer has already settled reads "waiting for [name] to confirm" and carries no action.
> 3. **An unconfirmed swap is badged from the moment it is accepted.** The groups-list action count keeps the two-way split it already had, but its second half is redefined from "completed trades whose sync is unapplied", a state this amendment deletes, to "swaps whose own half the viewer has not confirmed". No grace period: two people who swap in person and never touch the app would otherwise be reminded by nothing at all, and the giver's copies would stay pinned out of every match view. The split is what keeps this from reading as urgent, since a request blocks the other party while confirming your own half does not. `tradeSection` files the same trades under _Action needed_ so a tapped badge always has rows behind it.
> 4. **Cancel closes once either side has settled.** The giver's settle runs `disposeCopiesInTransaction`, which hard-deletes copy rows, so a later cancel cannot restore the copy, its id, or its condition, grade and notes. Cancel therefore accepts `pending` (initiator only, unchanged) and `reserved` only while both settle timestamps are null. The giver's settle names the damage up front ("removes 2 copies from Foils") rather than offering an undo that would silently mint fresh copies in place of the originals.
> 5. **A settled side releases the live slot.** `uq_card_trades_live` covered `pending` and `reserved`, so a half-settled trade blocked those two members from trading that printing again until the slow side acted. Its predicate now also requires both settle timestamps to be null. Allowing the second trade is safe because `assertSupplyAvailable` allocates by copy id (rule 3 of the 2026-08-03 amendment) and already excludes pinned copies, so it cannot draw on supply the first trade still holds.
> 6. **The live-trade ladder loses `traded`.** Rule 7 of the 2026-08-03 amendment made `asked → offered → reserved → traded` part of the contract, with `traded` meaning completed-and-unsynced. That state stops existing. Once you settle, the giver's copies are deleted and the receiver's are ordinary owned copies, so there is nothing left to annotate, and a chip for the other party's outstanding paperwork would be noise on a card browser. `cardTradeLivePhaseSchema` becomes `asked | offered | reserved`, and the live-by-printing query drops both its `traded` branch and the completed-with-unsynced arm of its `WHERE`.
> 7. **The group's traded count moves to first settle.** It summed `quantity` over `completed` trades, so a permanently half-settled trade would never have counted and the figure would have fallen against today, where one unilateral complete counted at once. It counts from the first settle instead. The stat is a group figure, not accounting.
> 8. **Existing `completed` rows with an unresolved sync roll back to `reserved`.** Under this model `completed` means both sides settled, which those rows have not. The migration clears `completed_at` and returns them to `reserved`, keeping whichever settle timestamp is already set, since a one-sided row is exactly the legal half-settled state now. A row that was completed prematurely comes back with its pins intact and both sides prompted, which is the recovery path the old model had no way to offer. It skips any row whose live slot a newer trade already holds, which the old predicate permitted. This also gives the stranded pins of rule 5 of the 2026-08-03 amendment a remedy that exists: the giver is prompted to settle, instead of being pointed at a sync buried in history.
>
> 9. **The giver's settle may name copies other than the pinned ones.** Rule 4 of the 2026-08-03 amendment let the giver pick which copies an accept promises, but only on a receiver-initiated request and only when `choiceMatters`. Every other route pins plainest-first, and even a picked pin is a guess made before the swap, so the copy that physically travelled is routinely not the one about to be deleted. `sync` therefore takes an optional `copyIds` on the giver's side, exactly `quantity` distinct ids, and disposes those instead. Omitted, the pins are still what goes.
>
>    The candidate set is wider than the accept path's, and deliberately so: the trade's own pins plus every free copy of the printing in the giver's **personal** collections, group-shared or not. A pin promises a copy into a live trade, so it must be one the group can see; a settle is a record of what left, and the card that changed hands often came out of a binder the group never saw. Nothing is re-pinned — the rows are hard-deleted in the same transaction — so no invariant about visibility survives the call to protect. `copy-options` serves both pickers and gains a `pinned` flag per copy; on a reserved trade it returns pins first and refuses once the giver's own half is settled. Only the giver may send `copyIds` (403 otherwise), and an id that is not a live candidate under the row lock is refused (409) rather than deleted.

> **Amendment (2026-08-10, match view).** Rule 1 of the 2026-08-03 amendment let an offer commit the giver's supply, but only the write path knew it. The match view kept advertising the committed copies, so _Trade lifecycle_'s "pending never hides anything" held for the view while `assertSupplyAvailable` refused the request behind it. A member saw the card, pressed Request, and got "Only 0 copies are still available", which reads as "they no longer have it" rather than "their copy is promised to someone else". Reported from a real trade where the giver's only copies of six cards sat on a 13-hour offer to a third member.
>
> 1. **The match view runs the same claim pass.** `copiesClaimedByPendingOffers` (`apps/api/src/repositories/friend-group-matches.ts`) drops the copies live offers commit, on top of the reserved-copy exclusion the view already had. `claimCopiesForOffers` moved to `apps/api/src/lib/trade-offer-claims.ts`, so the view, `assertSupplyAvailable` and the sweep share one allocation and cannot disagree about what is free. Offers living in another group are still resolved against that group's supply (rule 3 of the 2026-08-03 amendment), which costs one extra supply read per printing and other group, and only for printings the viewed group can see.
> 2. **Requests still hide nothing.** Only `initiator = 'giver'` rows claim, so several members may keep asking for one card and each still sees it. This is the same asymmetry as rule 1 of the 2026-08-03 amendment, now visible in the view instead of only at submit.
> 3. **`giverPrintingSupply` stays offer-agnostic.** It returns the copies offers commit, because every caller nets them itself and `setTradeQuantity` must exclude the very offer it is resizing.
> 4. **A shared tradelist page is not covered.** Browsing a member's list renders that list's own entries, not match rows, so a committed copy keeps its Request button there and still fails at `assertSupplyAvailable`. That page marks reserved copies rather than hiding them, so the fix there is a marker on the copy, not a filter. The Discord bot's "who has this?" reply is deliberately uncovered too: it answers who physically holds the card.

> **Amendment (2026-08-10, partial settle). Built 2026-08-11.** Rule 1 of the 2026-08-10 amendment made each side settle its own half, but a half is all-or-nothing. On a swap of three copies where one actually changed hands, the receiver picks between claiming three and claiming none, and either way the giver's pins for the rest stay committed. Partial settling is added by splitting the row, not by counting within it. Rules 1, 4 and 5 of that amendment are extended rather than replaced.
>
> 1. **A partial settle splits the trade and settles the split half.** The caller names a quantity `n` below the row's own. A new `card_trades` row is inserted for `n`, carrying the original's group, parties, `initiator`, printing, `accepted_at` and `receiver_wish_entry_id`, and the original drops to `quantity - n`. The caller's settle then applies to the new row alone. This asserts nothing about the other party's half: they settle each row separately, with different copies if that is what happened. A receiver who got one of three and a giver who handed over all three both record the truth, the split row completing and the remainder sitting giver-settled, which is the legal half-settled state rule 2 of that amendment already defines.
> 2. **The split is never a standalone operation.** `uq_card_trades_live` is unique on `(group_id, giver_user_id, receiver_user_id, printing_id)` where the row is `pending`, or `reserved` with both settle timestamps null. Two reserved halves of one trade would violate it. The insert therefore carries the caller's settle timestamp from the first statement, so the new row is outside the predicate before any uniqueness check runs, and the original keeps the live slot. Split and settle are one service call in one transaction, under the row lock the settle path already takes. There is no route that splits without settling and no "split this trade" button, now or later.
> 3. **Pins move, they are not deleted.** `card_trade_copies` is keyed `(trade_id, copy_id)` with `UNIQUE (copy_id)`, so the split reassigns `n` rows to the new trade with an UPDATE. The settle path's existing `deleteCopiesForTrade` is a delete-all and cannot serve here: a split row with no pins would give the giver nothing to dispose when they settle it. When the giver splits, the picker of rule 9 chooses which `n`, and the selection count is the split quantity. When the receiver splits they take plainest-first, since the receiver has no say over which of the giver's copies left.
> 4. **The remainder stays cancellable, and skip closes it when cancel cannot.** If both sides were unsettled at the split, the remainder still has two null timestamps, so rule 4's cancel window is open on it. That is the "the rest never arrived" exit, with no new state to model. Once the other party has settled, both halves inherit their timestamp, the remainder is past cancelling as rule 4 intends, and the receiver closes it with skip, which settles the half without touching their collection.
> 5. **`quantity` keeps meaning what is still in flight.** Every read model that sums it stays correct untouched: `live-by-printing`, the group's traded count, the groups-list badge split, `actionNeeded`, `tradeSection`. This is the reason for splitting rather than adding a settled-quantity column to each side, which would have required every one of those to subtract, and would still have needed a separate marker for a side that is finished below the full quantity.
> 6. **The split row is not a new trade.** It inherits an accept rather than performing one, so it sends no request or reserved email, keeps the original `accepted_at`, and sets `last_actor_user_id` to whoever split. `createTrade` is not on this path, and `assertSupplyAvailable` is not re-run, because the copies in question were committed by the accept being split. Both halves point at the same `receiver_wish_entry_id`, and their decrements sum to the original quantity.
> 7. **History carries one row per partial.** Four copies settled one at a time leave four completed rows for one agreed swap. Accepted rather than mitigated: the per-counterparty fold on the Trades tab collapses them under one member, and a `split_from_trade_id` column can be added later if the history reads badly. No schema change is required to build this.
>
> **As built (2026-08-11), three points the rules above left open.** The row lock of rule 2 is `reserveQuantityForSplit`, a guarded `UPDATE … SET quantity = quantity - n` that also refuses a caller whose own side is settled and a quantity that would leave no remainder. It is the whole concurrency story: two partial settles racing serialize on it and the loser 409s rather than driving the quantity negative, which is why there is no separate claim on the split path. Rule 3's pin move is stricter than written: `card_trade_copies.copy_id` is `ON DELETE CASCADE`, so a pin covering a copy the giver's settle disposes _must_ move to the split half, or it would vanish with the copy and leave the remainder pinned short of its own quantity. `selectSplitPins` moves those first and tops the count up plainest-first, which is the receiver's whole rule too. Rule 6's "sends no email" is implemented by inheriting `request_email_sent_at` and `reserved_email_sent_at` from the original, so the notification jobs see an announced row rather than a new one.

> **Amendment (2026-08-12, incoming stock in deck building). Built 2026-08-12.** Deck-building availability read `copies` and nothing else, so a card reserved to the viewer was invisible to it: the deck called the copy missing, priced it into the buy list, and said nothing about the swap already holding it. The giver's side of that same pin has been `lockedReserved` in the deck builder all along, so one `card_trade_copies` row was visible to one party and not the other. This adds the receiver's half without granting stock.
>
> 1. **Incoming annotates the shortfall, it never covers it.** `missingCount`, `shortfall` and every value total are unchanged by any incoming quantity. The model is `locked`, not the borrowed copies of ADR-039: a borrowed card is in hand and buildable, a reserved one is still in someone else's binder. _Post-trade sync_'s "nothing is yours until you say it arrived" is untouched, and the receiver's wish entry still survives to settle.
> 2. **Only `reserved` counts.** A pinned copy is `lockedReserved` for the giver and incoming for the receiver, so one pin drives both numbers and they cannot disagree. `asked` and `offered` pin nothing, and rule 2 of the 2026-08-10 match-view amendment keeps several requests alive against one card, so counting either phase would promise stock that may never arrive.
> 3. **The cap chains after locked.** Locked and incoming are disjoint physical cards, so incoming is capped at the shortfall locked has not already explained. Without the chain, a row with 2 locked and 2 incoming against a gap of 3 would account for 4.
> 4. **No server-side counterpart.** The `/decks` tile counts come from `buildableCountByCard` plus `borrowedCountByCard` and deliberately mirror the editor's inputs. Because incoming never moves `missingCount`, the two surfaces keep agreeing with no change to the route. A tile that wants to say "arriving" later needs its own query, and nothing here blocks that.
> 5. **The buy list still prices incoming copies.** A reserved trade stays cancellable while both sides are unsettled (rule 4 of the partial-settle amendment), so a completion cost that assumed delivery would understate. The annotation is the whole signal.
> 6. **The read model already existed.** `liveAnnotationsForUser` returns receiver rows per printing and drops a side the viewer has settled, so a card stops counting as incoming at the same moment it becomes a real copy. No new endpoint, and no window where it is both.

## Decision Drivers

- The literal ask: a request must reach the counterparty as a notification, accepting must reserve and hide the copy from others, and acknowledging must (optionally) reconcile both sides' lists/collections.
- Keep the surface narrow. ADR-013's "humans handle the trade out-of-band" instinct is right. We are adding coordination, not a marketplace. No prices, no payments, no chat.
- Reuse existing primitives. Tradelist supply is already modelled as concrete owned copies, collections already track copies, lists already track wish demand. The new state is one trade record plus a reservation link.
- No new delivery infrastructure. There is no websocket/SSE/service-worker/push/email stack today, and we are not building one for v1: in-app polling only.
- Correctness over cleverness: a reserved copy must be invisible to everyone else, exactly once, with no double-allocation.

## Considered Options

The four load-bearing forks (each resolved with the project owner):

1. **Trade unit**: one card per request _(chosen)_ · multi-card basket · two-sided proposal.
2. **Post-trade sync**: propose, each side confirms its own changes _(chosen)_ · fully automatic · no automatic changes.
3. **Completion trigger**: either party marks "traded" _(chosen)_ · both parties confirm.
4. **Notification delivery**: in-app polling, global bell + per-group section _(chosen)_ · in-app + email · in-app + web push.

Supporting forks (also resolved with the owner):

5. **Initiation**: either direction: request a card you want _or_ offer one you have _(chosen)_ · wanter-requests-only.
6. **Reservation granularity**: reserve by quantity, the remainder of a stack stays matchable _(chosen)_ · reserve the whole entry and auto-decline others.
7. **Expiry**: pending requests auto-expire after 7d, accepted reservations never auto-expire, either party can always cancel manually before completion _(chosen)_.
8. **Terms**: bare yes/no, no message, no in-app negotiation _(chosen)_ · optional note · structured negotiation.

## Decision Outcome

Build a single-card trade record (`card_trades`) with an explicit state machine, a per-copy reservation link (`card_trade_copies`), a reserved-copy exclusion in the match query, a propose-and-confirm post-trade sync that drives the existing copy-mutation services (`addCopies` / `disposeCopies`) and list repo, a global notification bell fed by polling, and a per-group Trades tab. Pending requests expire after 7d via a cron job. Reservations persist until completed or cancelled.

The decisive enabling fact (verified against `docs/schema.sql`, constraint `chk_lists_intent_kind`): a `trade`-intent list is always `kind = 'copy'`. Every tradable item is therefore a concrete owned `copy` with a known `printing_id`, living in a collection. This removes all ambiguity the feature could otherwise have: there is always a specific printing to reserve, a specific copy to remove from the giver's collection, and a specific printing to add to the receiver's. The match query already exposes `copyId` and `printingId` on every row (`MatchRow`, `apps/api/src/repositories/friend-group-matches.ts:39-49`).

### Consequences

- Good, because reservation is exact: pin specific `copy_id`s, exclude them from the match query with one `NOT EXISTS`. A reserved copy disappears for everyone, the rest of a stack keeps matching.
- Good, because post-trade sync is unambiguous and reuses the existing, event-emitting copy-mutation services (`addCopies` / `disposeCopies` in `apps/api/src/services/copies.ts`) plus list-entry mutations in the lists repo, so collection counts and `collection_events` stay consistent.
- Good, because there is no new delivery infrastructure: the bell is two query endpoints plus `refetchInterval`.
- Good, because the trade record is the single source of history, so we don't need a separate audit log.
- Bad, because it adds two new tables, a new top-level resource, a cron job, and a new header surface. Mitigated by the model being narrow, read-mostly, and additive.
- Bad, because "either party completes" trusts one side that the physical swap happened. Mitigated by sync being proposed, not forced: the other party still controls whether their own collection/lists change, and can simply not apply.
- Bad, because we knowingly allow a member to hold parallel pending/reserved trades for the same want (demand is not auto-consumed, see _Reservation semantics_). Accepted as simpler and truer to real life.

## Design Decisions

### What a trade is

One `card_trades` row = one card moving in one direction between two members of one group, for a `quantity` of copies. Roles are stored explicitly and do not depend on who clicked first:

- `giver_user_id`: owns the copies (the supply / tradelist side).
- `receiver_user_id`: wants the card (the demand / wishlist side).
- `initiator ∈ {giver, receiver}`: who started it. `receiver`-initiated is the literal _"I want this card"_ request, `giver`-initiated is the _"I have this, want it?"_ offer. The party who must accept is always the non-initiator.

`printing_id` (the concrete printing, from the matched copies) and `card_id` (denormalised, for grouping/display) are fixed at creation. `quantity > 0` is the number of copies. There is no note and no price field: terms are settled out-of-band, exactly as ADR-013 intended for the swap itself. The effective trade preferences already surfaced in the match view (`sellPref` / `buyPref`) remain informational context on the row. They are not copied into the trade.

### Trade lifecycle (state machine)

```
                 ┌────────── decline (recipient) ──────────► declined  (terminal)
                 │
   create ──► pending ──── cancel (initiator) ─────────────► cancelled (terminal)
 (initiator)     │
                 ├──────── 7d elapsed (cron) ─────────────► expired   (terminal)
                 │
                 └ accept (recipient) ─► reserved ─ cancel (either) ──► cancelled (terminal)
                                            │
                                            └ mark-traded (either) ──► completed (terminal)
                                                                          │
                                                          ┌───────────────┴───────────────┐
                                                  giver applies/skips           receiver applies/skips
                                                  their side's sync             their side's sync
```

- **`pending`**: created by the initiator, awaiting the recipient. Carries `expires_at = created_at + 7d`. No copies are reserved yet (pending never hides anything, multiple members may have pending requests against the same stack).
- **`reserved`**: the recipient accepted. `quantity` specific copies are pinned into `card_trade_copies` and become invisible in every match view. No expiry.
- **`completed`**: either party marked the physical swap done. Each side independently gets a proposed sync (see below). Terminal as a trade. The only follow-up is each party resolving their own sync.
- **`declined`**: recipient declined a pending request. Terminal.
- **`cancelled`**: initiator cancelled while `pending`, or either party cancelled while `reserved`. Releases any reserved copies. Terminal.
- **`expired`**: pending request hit 7d with no response (cron). Terminal.

Status timestamps: `accepted_at`, `completed_at`, `closed_at` (declined/cancelled/expired), plus `created_at` / `updated_at`. `last_actor_user_id` records who caused the most recent transition (drives unread, below).

**Auto-cancel of a pending request whose basis vanishes.** While `pending`, if the giver removes the underlying copies from the group (deletes them, moves them off the shared tradelist, or unshares the list) such that no matching shared copy remains, the pending request is auto-cancelled on next interaction (and surfaced as cancelled). Once `reserved`, the trade has snapshotted its copies and is independent of later list edits: editing or unsharing the tradelist does not void a reservation, because reservation is about the physical copies, not the list entry.

### Reservation semantics (supply-side, by quantity)

On accept, the system selects `quantity` of the giver's copies of `printing_id` that are (a) currently in a `trade`-intent list shared with this group and (b) not already in `card_trade_copies`, and inserts a row per copy into `card_trade_copies(trade_id, copy_id)`. If fewer than `quantity` unreserved copies are available, accept is rejected with a clear "only N left" error. The recipient (giver) then declines, since there is no negotiation step to adjust quantity. Pending requests are never auto-declined by a competing acceptance. They simply expire at 7d or become un-acceptable once the stack is exhausted.

`card_trade_copies` holds only currently-spoken-for copies. Rows are created on accept and removed when the claim ends:

- decline / cancel / expire → delete the rows (release the copies back to matching).
- giver applies sync → the copies are deleted, FK cascade removes the rows.
- giver skips sync → delete the rows explicitly (the copy physically left but the giver chose not to edit their data, so the claim is released and the stale copy reappears as available until they fix it manually: that is the cost of skipping).

`UNIQUE (copy_id)` on `card_trade_copies` guarantees a copy is claimed by at most one live trade. Because rows exist iff a copy is currently reserved-or-completed-pending-sync, the match query excludes reserved copies with a bare `NOT EXISTS`, no status join needed (the cleanup invariant above is what makes this safe).

**Demand is deliberately not auto-consumed.** Reserving copies hides the _supply_ (the giver's copies) from everyone. It does not hide the receiver's _want_ from other potential suppliers. If Alice reserves a copy for Bob's want-of-one, Carol's matching offer still shows to Bob until the trade completes. Rationale: it is simpler (no cross-supplier quantity windowing in SQL), and it is truer to life: if Alice flakes, Carol's offer is still right there. The want is cleaned up the natural way: completing the trade decrements Bob's wishlist entry during sync (below). This is the chosen "remainder stays" model applied to the side the requirement actually named (the copy), and is listed under _Will Not Be Built_ for the demand side.

### Match-query change

`runMatchQuery` (`apps/api/src/repositories/friend-group-matches.ts`) gains exactly one filter on the trade/supply side:

```sql
-- reserved or completed-pending-sync copies are invisible to everyone
AND NOT EXISTS (
  SELECT 1 FROM card_trade_copies ctc WHERE ctc.copy_id = cp.id
)
```

Nothing else changes. Both directions (`others-have-your-wants`, `others-want-your-haves`) inherit it because they share the one query body. The viewer's own reserved copies also vanish from their "members want your haves" panel, which is correct: a reserved copy is not on offer.

### Post-trade sync (propose, each side confirms its own)

`completed` is reached by either party's "mark as traded". It does not auto-mutate anyone's data. Instead each party independently gets a proposed set of changes to their own collection/lists, which they Apply or Skip. Tracked by `giver_sync_applied_at` / `receiver_sync_applied_at` (each set on Apply _or_ Skip, so the action drops out of the bell once resolved).

- **Giver's proposed change:** _Remove `quantity` × [card] ([printing]) from your collection (they were on "[tradelist]")._ `applyGiverSync`, in one transaction: (1) delete this trade's `card_trade_copies` rows (releasing the reservation so the dispose guard below passes), then (2) `disposeCopies(transact, giverUserId, reservedCopyIds)` (the copies service, `apps/api/src/services/copies.ts`), which logs a `removed` collection event and hard-deletes the copies. Deleting each copy cascades through `fk_list_entries_copy_user` (`(copy_id, user_id) → copies(id, user_id)`, `ON DELETE CASCADE`, already in the schema) to remove its copy-kind tradelist entry. No new FK needed.
- **Receiver's proposed change:** _Add `quantity` × [card] ([printing]) to [collection ▾, default: your Inbox], and remove `quantity` from your wishlist "[list]"._ `applyReceiverSync`, in one transaction mirroring `addCopies`' body: insert `quantity` fresh copies of `printing_id` into the chosen collection (validate writable, default to the receiver's inbox via `ensureInbox` when omitted), `logEvents` an `added` event, then decrement the matched wish entry (`receiver_wish_entry_id`) via the lists repo (`updateEntry`, or `deleteEntry` at zero). If the wish entry no longer exists (`ON DELETE SET NULL` fired), skip the decrement and just add the copies. Do not split the copy-add and wish-decrement across two transactions.

Both copy mutations go through the copies service (not the raw `copiesRepo`) so `collection_events` (`added` / `removed`, preserved-on-delete via the `SET NULL` FK from migration 140) and derived counts stay consistent. List-entry quantity changes do not emit collection events, so the wishlist decrement uses the lists repo directly. Never raw SQL (repo convention). Skipping is always allowed. The trade is "done" regardless, and a party who declines to let the app touch their data simply leaves their lists as-is.

### Notifications: a global bell, fed by polling

A new global bell in the app header aggregates _trade_ activity across all the viewer's groups. No email, no web push, no service worker, no websocket: in-app only.

- **Unread / actionable** for user U = trades where U is giver or receiver, the latest change was made by the _other_ party (`last_actor_user_id <> U`), U has not seen it (`U's seen_at IS NULL OR updated_at > U's seen_at`), and the status is one U can act on or cares about: a `pending` request awaiting U, an `accept`/`decline`/`cancel`/`expire` U didn't cause, or a `completed` trade whose U-side sync is unresolved.
- The bell badge polls `GET /api/v1/trades/summary` with TanStack Query `refetchInterval: 30_000` (matching `apps/web/src/hooks/use-status.ts`) plus `refetchOnWindowFocus: true`. Opening the dropdown lists recent trade items grouped by trade, each deep-linking into the relevant group's Trades tab (below). Viewing marks the listed trades seen for the viewer (`giver_seen_at` / `receiver_seen_at`).
- This bell is separate from and additive to ADR-013's two existing badges (the avatar-menu _invite_ badge and the per-group-row _join-request_ badge), which remain unchanged. Consolidating all three into one bell is explicitly out of scope here.

### Expiry & cron

Pending requests expire 7d after creation. A new cron job runs every 15 minutes and sets `status='expired'`, `closed_at=now()` for `pending` rows where `expires_at < now()`. Add a `cardTradesExpire: null as Cron | null` slot to the `cronJobs` object in `apps/api/src/cron-jobs.ts`, then wire the schedule in `apps/api/src/index.ts` alongside the existing jobs: `new Cron(schedule, { protect: true }, …)` calling `runJob({ repos, log }, "card-trades.expire", "cron", () => repos.cardTrades.expirePending())`. A partial index on `(expires_at) WHERE status='pending'` keeps the scan cheap. Reservations never auto-expire.

### Authorization

- **create**: initiator must be a group member, the named counterparty must be a member, and a live match must exist between them in this group at creation time (the copies are on the giver's group-shared tradelist, the receiver has a matching group-shared wish). Validated by reusing the match repository so we never create a trade that wasn't a real match.
- **accept / decline**: only the non-initiator of a `pending` trade.
- **cancel**: when `pending`, the initiator. When `reserved`, either party.
- **mark-traded (complete)**: when `reserved`, either party.
- **sync apply / skip**: each party for their own side, only while `completed`.
- **seen**: either party, for trades they are in.

All group membership checks reuse `loadGroupForMember` / `getMembership` from the friend-groups route (`apps/api/src/routes/authenticated/friend-groups.ts:65-99`).

## User Experience Surfaces

Pixel design is the implementing PR's concern. This is what the model and API must support.

### Initiation from the match view

The Trading tab's match rows (`apps/web/src/components/friend-groups/match-row-card.tsx`) gain a single action per row:

- An incoming row ("members have what you want") shows Request → opens a small dialog with a quantity stepper (`1..availableCount`, default `min(yourWishQuantity, availableCount)`) and a confirm. Creates a `receiver`-initiated trade.
- An outgoing row ("members want what you have") shows Offer → same dialog (`1..availableCount`, default `min(theirWishQuantity, availableCount)`). Creates a `giver`-initiated trade.

A row that already has a live trade between the two of you for that printing shows its status inline (Pending / Reserved) instead of the button.

### Per-group Trades tab

The group page (Trading / Collections / Members tabs, from commit `30398b60`) gains a Trades tab (`?tab=trades`) listing the viewer's trades in this group, grouped:

- **Action needed**: pending requests awaiting you, completed trades whose sync you haven't resolved.
- **Active**: your pending requests awaiting them, reserved trades not yet traded.
- **History**: completed / declined / cancelled / expired.

Each item shows card thumbnail (reuse the `<CardCell>`/match-row visuals), counterparty (name + per-group nickname + avatar), direction, quantity, status, and the contextual action(s): Accept/Decline, Cancel, Mark traded, Apply/Skip sync. The counterparty's nickname (ADR-013) remains the channel for arranging the actual swap.

### Empty states

- **Trades tab, nothing yet:** "No trades in this group yet. Find a match in the Trading tab and send a request to get started."
- **Bell, nothing:** "No trade activity. When someone requests a card or accepts your request, it'll show up here."

## Schema Sketch

Next sequential migration: `apps/api/src/db/migrations/143-card-trades.ts` (current highest is `142-list-sort-order`). Register it in the barrel `apps/api/src/db/migrations/index.ts` (`import * as m143 …` + `"143-card-trades": m143`), then regenerate `docs/schema.sql` in the same commit (`docker exec openrift-db-1 pg_dump …`). Ask the user before running `bun db:migrate`: the DB is shared.

```sql
CREATE TABLE card_trades (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  group_id                uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  giver_user_id           text NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  receiver_user_id        text NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  initiator               text NOT NULL CHECK (initiator IN ('giver', 'receiver')),
  printing_id             uuid NOT NULL REFERENCES printings(id),
  card_id                 uuid NOT NULL REFERENCES cards(id),
  quantity                integer NOT NULL CHECK (quantity > 0),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','reserved','completed',
                                              'declined','cancelled','expired')),
  -- demand-side sync target, snapshotted from the match; nulled if the wish entry is deleted
  receiver_wish_entry_id  uuid REFERENCES list_entries(id) ON DELETE SET NULL,
  last_actor_user_id      text REFERENCES users(id) ON DELETE SET NULL,
  giver_seen_at           timestamptz,
  receiver_seen_at        timestamptz,
  giver_sync_applied_at   timestamptz,
  receiver_sync_applied_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  accepted_at             timestamptz,
  completed_at            timestamptz,
  closed_at               timestamptz,   -- declined / cancelled / expired
  expires_at              timestamptz,   -- pending TTL (created_at + 7d); cleared once not pending
  CHECK (giver_user_id <> receiver_user_id)
);

CREATE INDEX idx_card_trades_receiver ON card_trades (receiver_user_id, status);
CREATE INDEX idx_card_trades_giver    ON card_trades (giver_user_id, status);
CREATE INDEX idx_card_trades_group    ON card_trades (group_id, status);
CREATE INDEX idx_card_trades_expiry   ON card_trades (expires_at) WHERE status = 'pending';

-- At most one *live* trade per card between the same two members in a group,
-- regardless of who initiated (giver/receiver are fixed by who owns the copies).
CREATE UNIQUE INDEX uq_card_trades_live
  ON card_trades (group_id, giver_user_id, receiver_user_id, printing_id)
  WHERE status IN ('pending', 'reserved');

-- updated_at maintenance via the existing project trigger function.
CREATE TRIGGER card_trades_set_updated_at
  BEFORE UPDATE ON card_trades FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The set of copies *currently* reserved by a live trade. Rows exist iff a copy
-- is reserved or completed-pending-sync; cleaned up on release/consume. This is
-- what the match query excludes and what the giver's sync deletes.
CREATE TABLE card_trade_copies (
  trade_id uuid NOT NULL REFERENCES card_trades(id) ON DELETE CASCADE,
  copy_id  uuid NOT NULL REFERENCES copies(id)      ON DELETE CASCADE,
  PRIMARY KEY (trade_id, copy_id),
  UNIQUE (copy_id)   -- a copy is claimed by at most one live trade
);

-- Copy deletion during giver-sync needs no new FK: list_entries already has
-- fk_list_entries_copy_user ((copy_id, user_id) → copies(id, user_id)) ON DELETE
-- CASCADE, so disposing a copy removes its copy-kind tradelist entry.
-- applyGiverSync deletes the card_trade_copies rows *before* disposing (so the
-- dispose guard passes); the ON DELETE CASCADE on copy_id is only a backstop for
-- account deletion (users → copies → card_trade_copies).
```

`updated_at` follows the existing `set_updated_at()` trigger convention used across the schema.

## API, Repository, and Web Layers

### Repository: `apps/api/src/repositories/card-trades.ts`

- `create({ groupId, initiator, giverUserId, receiverUserId, printingId, cardId, quantity, receiverWishEntryId })` → inserts `pending`, `expires_at = now() + interval '7 days'`, `last_actor = initiator`.
- `accept(tradeId, byUserId)` → validates `byUserId` is the non-initiator, selects and pins `quantity` unreserved group-shared copies into `card_trade_copies` (rejects if too few), status → `reserved`.
- `decline(tradeId, byUserId)` / `cancel(tradeId, byUserId)` → guard per _Authorization_. On cancel from `reserved`, delete the `card_trade_copies` rows.
- `markTraded(tradeId, byUserId)` → `reserved` → `completed`.
- `applyGiverSync(tradeId)` → `disposeCopies(transact, giverUserId, reservedCopyIds)` (copies service), set `giver_sync_applied_at`. `applyReceiverSync(tradeId, targetCollectionId?)` → `addCopies(...)` (defaults to inbox) + wish-entry decrement via the lists repo, set `receiver_sync_applied_at`. Copy writes go through `apps/api/src/services/copies.ts`, never the raw repo, so events stay consistent.
- `skipSync(tradeId, side)` → set the side's `*_sync_applied_at`. For the giver side, also delete the `card_trade_copies` rows.
- `cancelForDepartingMember(transact, groupId, userId)` → cancel the user's `pending`/`reserved` trades in that group and release their reserved copies. Called from the `/leave` and kick handlers.
- `markSeen(tradeIds, byUserId)`; `listForUser(userId, { groupId?, statuses? })`; `getById`; `summaryForUser(userId)` → `{ unread }` for the bell; `expirePending()` (cron).

Defensive `JSON.parse` is not needed here (no jsonb columns), but follow the repository-only DB-access rule throughout. Route handlers access it via `c.get("repos")`.

### API routes: top-level `apps/api/src/routes/authenticated/card-trades.ts`

Mounted at `/api/v1/trades` (top-level so the bell can read across groups, each row carries its `group_id`):

- `POST /api/v1/trades`: create.
- `GET  /api/v1/trades?groupId=&status=`: the viewer's trades (per-group Trades tab, omit filters for all).
- `GET  /api/v1/trades/summary`: bell counts (polled).
- `POST /api/v1/trades/:id/accept` · `/decline` · `/cancel` · `/complete`
- `POST /api/v1/trades/:id/sync` (body: `{ targetCollectionId? }`) · `POST /api/v1/trades/:id/sync/skip`
- `POST /api/v1/trades/seen` (body: `{ tradeIds }`)

### Web: `apps/web/src/hooks/use-card-trades.ts` + query keys

Server functions + TanStack Query hooks mirroring the routes: `useUserTrades`, `useGroupTrades(slug)`, `useTradeSummary` (with `refetchInterval` + `refetchOnWindowFocus`), and mutations `useCreateTrade`, `useAcceptTrade`, `useDeclineTrade`, `useCancelTrade`, `useCompleteTrade`, `useApplyTradeSync`, `useSkipTradeSync`, `useMarkTradesSeen`. Add a `trades` block to `apps/web/src/lib/query-keys.ts` (alongside the existing `friendGroups` block). Mutations invalidate the affected group's `friendGroups.matches` key (reserved copies changed) plus the `trades.*` keys.

### React conventions

- React Compiler is on, so no `useMemo` / `useCallback` / `React.memo` in new code.
- The Trades-tab list `.map()` reads per-row status that changes on interaction (optimistic accept/cancel). Keep that changing state out of the parent closure with a Zustand store + per-row selector subscriptions, mirroring `match-variants-fold-store.ts` and the `RuleRow` pattern in `rules-page.tsx`. Any such store and any hook with logic gets a `*.test.ts`.
- The global bell is a header surface; its open/closed state is local UI state, not a store.
- Use BaseUI primitives, lucide `*Icon` imports, the type scale, and `cn()` (standard project conventions).

## Resolved Details

Everything below is decided. Implementation needs no further input.

**Record fields beyond the schema.** No `direction` column: derive the label from `initiator` (`receiver` ⇒ "request/want", `giver` ⇒ "offer"). No note, price, or terms columns. No per-copy history. The `card_trades` row is the history.

**Trade DTO** (returned by `GET /api/v1/trades` and `/:id`): `{ id, groupId, groupSlug, role ('giver'|'receiver', the viewer's side), initiator, counterparty: { userId, name, nickname, gravatarHash }, printingId, cardId, quantity, status, createdAt, updatedAt, acceptedAt, completedAt, closedAt, expiresAt, viewerSeenAt, viewerSyncAppliedAt, counterpartySyncAppliedAt, unseen (bool), actionNeeded ('accept-or-decline'|'cancel'|'complete'|'apply-sync'|null) }`. Card name/image are not in the DTO: the web resolves them from the loaded catalog by `printingId`/`cardId`, exactly as match rows and copies do.

**Creation (`POST /api/v1/trades`).** Originates only from a match row, so a matching shared wish always exists. The handler sets `giver_user_id` = the copy owner (`s_sell.userId` from the match), `receiver_user_id` = the wisher, `initiator` = the caller's role on that row, `receiver_wish_entry_id` = the match's `buyEntryId`, `printing_id`/`card_id` from the match, `group_id` from the row, `status='pending'`, `expires_at = now() + 7d`, `last_actor_user_id` = caller. Validates: caller and counterparty are both current members; the match still holds (re-run the match repo scoped to that counterparty + printing); `1 ≤ quantity ≤ availableCount`; and no existing live trade for `(group, giver, receiver, printing)`. `uq_card_trades_live` returns 409 otherwise. Dialog quantity: default `min(demandQuantity, availableCount)`, min 1, max `availableCount`. `availableCount` already nets out reserved copies (filtered from the match query).

**Acceptance (`POST /api/v1/trades/:id/accept`).** Caller must be the non-initiator. One transaction: select `quantity` copy ids that (a) belong to the giver, (b) sit on a `trade`-intent list shared with this group, and (c) are absent from `card_trade_copies`. If fewer than `quantity`, abort 409 "Only N copies still available". Insert the selected ids, flip `status='reserved'`, set `accepted_at`, `expires_at=NULL`, `last_actor`=caller. `UNIQUE(copy_id)` makes a racing concurrent accept of the same copy fail. The loser re-selects or returns the 409.

**Reservation scope is global.** `card_trade_copies` is not group-scoped in the match exclusion, so a copy reserved in one group is hidden from every group's match view: a physical card is promised at most once.

**Reserved copies cannot be silently destroyed.** Add a guard to the `disposeCopies` service (the single copy-deletion choke point, `POST /copies/dispose`): if any `copyId ∈ card_trade_copies`, throw 409 "This card is reserved in an active trade — cancel the trade to free it." `applyGiverSync` deletes the reservation rows first, so it is exempt. `moveCopies` stays unguarded: moving a reserved copy between collections is fine (reservation is by copy id, collection-independent).

**State transitions: who acts, `last_actor`, side effects.**

| From → To            | Who           | `last_actor` | Side effects                    |
| -------------------- | ------------- | ------------ | ------------------------------- |
| (create) → pending   | initiator     | initiator    | `expires_at = +7d`              |
| pending → reserved   | non-initiator | acceptor     | pin copies; `expires_at = NULL` |
| pending → declined   | non-initiator | decliner     | `closed_at`                     |
| pending → cancelled  | initiator     | initiator    | `closed_at`                     |
| pending → expired    | cron          | **NULL**     | `closed_at`                     |
| reserved → completed | either party  | actor        | `completed_at`                  |
| reserved → cancelled | either party  | actor        | release copies; `closed_at`     |

Cron expiry uses `last_actor = NULL` ("system"), which counts as unseen for both parties until seen.

**Notifications / bell.** Unread for viewer V = trades where V is giver or receiver, `(last_actor_user_id <> V OR last_actor_user_id IS NULL)`, and `(V's seen_at IS NULL OR updated_at > V's seen_at)`. Bell badge = count of unread. `GET /trades/summary` returns `{ unread }`. Opening the bell sets V's `seen_at = now()` for the listed trades. Opening a group's Trades tab marks that group's trades seen. "Action needed" is status-derived and independent of seen: a pending awaiting you, a reserved you can complete, or a completed whose your-side sync is unresolved stays flagged even after the notification is read. Notification lines (card name resolved client-side):

- new request → recipient: "{counterparty} wants {card}". new offer → recipient: "{counterparty} offers you {card}"
- accepted → initiator: "{counterparty} accepted: {card} is reserved"
- declined → initiator: "{counterparty} declined your request for {card}"
- cancelled → other party: "{counterparty} cancelled the trade for {card}"
- completed → other party: "{counterparty} marked {card} as traded: review your changes"
- expired → initiator: "Your request for {card} expired"

**Membership & account changes.** Leaving or being kicked cancels the departing member's `pending`/`reserved` trades in that group and releases their reserved copies: both the `/leave` and kick handlers (`apps/api/src/routes/authenticated/friend-groups.ts`) call `cardTrades.cancelForDepartingMember(transact, groupId, userId)` alongside `removeMember`. Account deletion needs no special code: `card_trades.{giver,receiver}_user_id → users ON DELETE CASCADE` deletes the user's trades, and `card_trade_copies` cascades from both `trade_id` and `copy_id`, releasing the counterparty's claims by FK.

**Pending whose basis vanished.** No proactive hooks into the unshare / remove-copy paths: they stay decoupled from trades. A pending request whose underlying shared copies no longer exist simply fails acceptance (the availability check returns 409 and the request is set `cancelled`, `last_actor=NULL`) or lapses at the 7d expiry. Reserved trades are immune: their copies are pinned.

**Trades tab.** Three sections (Action needed / Active / History), each sorted `updated_at DESC`. Rows show card thumbnail, counterparty (name + nickname + avatar), derived direction, quantity, status, and the contextual buttons (Accept/Decline · Cancel · Mark traded · Apply/Skip sync). Price/trade-type preferences are not shown here: terms are out-of-band, prefs live only on discovery (match) rows.

**Bell placement.** In the authenticated layout header, beside the avatar menu. Separate from ADR-013's invite and join-request badges.

**Suggested changelog entry** (implementing PR, under the ship date): `feat: Ask a group member for a card you want — they get a notification, accepting reserves it for you, and after the trade your collection, wishlist, and tradelist update with one click`.

## Will Not Be Built

- **Negotiation / counter-offers / messages.** A request is bare yes/no. No note field, no price proposal, no thread. Terms are settled out-of-band via the per-group nickname channel, exactly as ADR-013 intended for the swap.
- **Payments / money handling.** Price preferences stay informational; OpenRift never touches money.
- **Multi-card baskets or two-sided proposals.** One card per trade record. A multi-card swap is several independent records.
- **Two-party completion confirmation.** Either party completes. The _sync_ is the per-party control, not a second completion handshake.
- **Demand-side reservation.** Reserving hides the giver's copies only. It does not hide the receiver's want from other suppliers. The want clears via the wishlist decrement at completion-sync.
- **Per-copy trade history / audit log.** The `card_trades` row is the history. `card_trade_copies` is live state only.

## Deferred / Out of Scope

- **Email and web push.** In-app polling only for v1. Revisit if "I missed a request" becomes a real complaint: a service worker + Web Push, or transactional email, can layer on later without schema change.
- **Real-time delivery (websocket / SSE).** Polling is sufficient at friend-group scale.
- **Reservation auto-expiry.** Only pending requests expire (7d). A stuck reservation is resolved by manual cancel. Add a reservation TTL later only if abandoned reservations pile up.
- **Bulk actions** (accept/cancel many at once) and a one-click "trade everything we match on".
- **Consolidating the three notification badges** (invites, join-requests, trades) into one inbox.
- **Configurable expiry window.** Hard-coded 7d for now.

## Confirmation

Repository / integration tests (`apps/api`, temporary DB via `setupTestDb()`, dropped in `afterAll`, never the dev DB, run from main, not a worktree):

- A `pending` request reserves nothing. The matched copies still appear in every member's match view.
- `accept` pins exactly `quantity` copies. Those copies vanish from all members' match views (including the giver's own outgoing panel). The remainder of a larger stack still matches.
- `accept` is rejected when fewer than `quantity` unreserved copies remain. The trade stays `pending`.
- `decline` / `cancel` / `expire` release reserved copies back into matching.
- `UNIQUE(copy_id)` prevents a copy being reserved by two live trades.
- `complete` makes both sides' sync available. Giver Apply (via `disposeCopies`) emits a `removed` event, deletes the reserved copies, and cascade-removes their copy-kind tradelist entries. Receiver Apply (via `addCopies`) emits an `added` event, inserts `quantity` copies of the exact `printing_id` into the chosen collection (default inbox), and decrements/removes the matched wish entry. Either side Skip resolves without mutating that side (giver Skip also releases the reserved copies).
- A `pending` request is auto-cancelled when the giver removes/unshares its underlying copies before acceptance. A `reserved` trade survives later edits/unshares of the giver's tradelist.
- `expirePending()` moves only `pending` rows past 7d to `expired`, nothing else.
- Authorization: non-members cannot create, only the non-initiator can accept/decline, only the initiator can cancel a pending, either party can cancel a reservation and mark traded, and each party can only sync their own side.
- `uq_card_trades_live` rejects a second live trade for the same `(group, giver, receiver, printing)` with 409. Once the first is terminal (declined/cancelled/expired/completed), a new one is allowed.
- Two concurrent accepts that would pin the same copy: exactly one succeeds, the other gets the "only N available" 409 (enforced by `UNIQUE(copy_id)`).
- `disposeCopies` refuses a copy that is in `card_trade_copies` (409). `moveCopies` on a reserved copy still succeeds. `applyGiverSync` (which releases the reservation first) disposes successfully.
- Leaving or being kicked cancels the departing member's `pending`/`reserved` trades in that group and releases their reserved copies. Remaining members' match views recover those copies.
- Deleting a user's account cascades away their trades and releases the counterparty's reserved copies (FK only, no service code).
- Cron expiry sets `status='expired'` and `last_actor=NULL` for `pending` past 7d only. The initiator sees the expired trade as unread until they view it.
- Bell unread excludes changes the viewer made themselves and includes system (`last_actor IS NULL`) changes. Opening the bell clears unread without clearing status-derived "action needed".

Unit tests (`apps/web`, vitest): the bell unread/actionable derivation (seen vs unseen, self-actor excluded, per status), the trade-action store reducers (optimistic transitions, reset between tests via `createStoreResetter()`), and quantity-default computation for the Request/Offer dialog.

The implementing PR adds a user-facing `feat:` entry to `apps/web/src/CHANGELOG.md` (feature is user-visible, not admin-only).

## More Information

- ADR-013 (Friend Groups for Trading Discovery): supersedes its _Trade execution_ (Will Not Be Built) and _Notifications_ (Deferred) items. Everything else stands.
- ADR-005 (Collection Tracking Data Model): copies, collections, the deferred "trade sessions" idea.
- ADR-017 (Trade Preferences): the `sellPref` / `buyPref` shown informationally on match rows.
- Match query: `apps/api/src/repositories/friend-group-matches.ts`. Group auth: `apps/api/src/routes/authenticated/friend-groups.ts`. Copy mutations with event logging: `apps/api/src/services/copies.ts` (`addCopies`, `disposeCopies`) + `apps/api/src/services/event-logger.ts`. Cron registry: `apps/api/src/cron-jobs.ts` (schedule wiring in `apps/api/src/index.ts`).
