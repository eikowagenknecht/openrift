---
status: accepted
date: 2026-07-08
---

# ADR-039: Card Lending Ledger

## Context and Problem Statement

Playgroups lend cards constantly: a friend borrows the missing playset for a Summoner Skirmish and returns it two weeks later. OpenRift has no way to record this. Every existing primitive assumes ownership and possession coincide: a lent card should still count as owned (collection stats, exports, playset math) but is physically absent (it must not count for deck building and must not be offered in trade matching). Today the closest workaround is a "Lent to Bob" collection marked unavailable for deck building, which loses who has the card, since when, and whether it came back, and gives the borrower nothing. How do we track lending without breaking the meaning of collections, availability, or trade matching?

## Decision Drivers

- Ownership and possession must diverge cleanly: owned everywhere ownership matters, absent everywhere possession matters.
- Much of real lending involves people who are not on the app. Requiring a counterparty account would make the ledger useless for them.
- Recording must be one-sided and instant. At the kitchen table the lender hands over the card and notes it down; the borrower must not have to act for the lender's data to be correct.
- Nothing may ever be written into another user's collections or lists without their action. A borrower's view of a loan is derived and read-only.
- Reuse proven primitives: trade reservations (ADR-019) already pin concrete `copy_id`s and hide them from match queries with a bare `NOT EXISTS`.
- Keep the surface narrow, coordination not enforcement: no deposits, no penalties, no negotiation, the same stance ADR-019 took for trades.

## Considered Options

The load-bearing forks, each resolved with the project owner:

1. **Storage model**: loan as a claim on copies that stay in their home collection _(chosen)_ · move copies to a system "lent" collection · status column on `copies`.
2. **Loan unit**: one printing plus quantity per loan, mirroring `card_trades` _(chosen)_ · multi-printing basket.
3. **Borrower**: a friend-group co-member or a free-text name _(chosen)_ · members only · free text only.
4. **Initiation**: lender records, loan is active immediately, member borrowers acknowledge or reject _(chosen)_ · accept-gated like trades · lender-private with no borrower side.
5. **Borrower surfaces**: borrowed view plus deck-builder counts, after acknowledgment _(chosen)_ · borrowed view only · none in v1.
6. **Returns**: only the lender marks returns, partial quantities allowed _(chosen)_ · all-or-nothing · either party, like mark-traded.
7. **Non-return**: one terminal write-off with a lender-side removal proposal _(chosen)_ · convert to a completed trade with two-sided sync · no special support.
8. **Trade interplay**: lent copies excluded from matching plus a mutual claim guard _(chosen)_ · exclusion without guard · still matchable with an "on loan" hint.
9. **Copy selection**: automatic, preferring the collection the action was triggered in _(chosen)_ · strict to that collection · explicit picker.
10. **UI home**: a personal Loans page _(chosen)_ · a per-group tab like Trades · both.

## Decision Outcome

Build a personal lending ledger: a `loans` row records that `quantity` copies of one printing are with one borrower, and `loan_copies` pins the concrete copies, which never leave their home collection. Pinned copies drop out of the lender's deck-building availability and out of group trade matching, exactly like trade reservations. A member borrower acknowledges the loan and then sees borrowed counts in their deck builder; a free-text borrower is just a name. Loans end by lender-marked returns (partial or full) or by a write-off that offers to remove the copies from the lender's collection.

The feature needs no cron job, no emails, and no two-sided sync. The only proposed mutation is the lender-side removal on write-off, which reuses `disposeCopies`.

### Consequences

- Good, because ownership and possession separate without moving data: owned counts, exports, and the copy's home collection stay untouched for the whole loan, and a return is just deleting pin rows.
- Good, because exclusion reuses the ADR-019 reservation mechanics (pin table with `UNIQUE (copy_id)`, cleanup invariant, `NOT EXISTS` in the match query), so the match query gains one more exclusion rather than a new concept.
- Good, because free-text borrowers make the ledger complete on day one, while member borrowers get the richer two-sided view from the same record.
- Bad, because copies now have two claim sources (`card_trade_copies`, `loan_copies`) and the double-claim guard spans both tables; each has its own `UNIQUE (copy_id)` but the cross-table check lives in the services, inside the claiming transaction.
- Bad, because single-printing loans make "I lent my whole deck" a series of separate recordings with no grouping. Accepted: a deck-level action is explicitly not built (below).
- Bad, because a loan naming a member appears on that member's side without their prior consent. Accepted: it is unconfirmed until acknowledged, has zero effect on their data, and can be rejected.
- Bad, because skipping the write-off removal leaves stale copies that reappear as available and matchable until fixed manually, the same cost-of-skipping rule as trade sync.

### Confirmation

- Schema review in `docs/schema.sql`: `loans` and `loan_copies` exist as specified, no new cron entries, no new email templates.
- Integration tests: pinned copies leave the deck-avail bucket and the match query; lending a reserved copy and reserving a lent copy both fail with an "only N available" error; partial returns decrement and close at zero outstanding; write-off with apply disposes the copies and emits collection events.

## Design Decisions

### What a loan is

One `loans` row: `id`, `lender_user_id`, `borrower_user_id` / `borrower_name` (exactly one set, `CHECK`ed), `printing_id`, `card_id` (denormalised for grouping, as in `card_trades`), `quantity`, `returned_quantity`, `status ∈ {active, returned, written_off}`, `acknowledged_at`, `rejected_at`, `created_at`, `updated_at`, `closed_at`. There is no `group_id`: a member borrower must share at least one friend group with the lender at creation (that is how the picker finds them), but the loan is a personal record and survives either party leaving the group. There is no note, no due date, and no price; terms and reminders are out-of-band, the same stance trades take.

### Pin semantics: copies never move

`loan_copies (loan_id, copy_id)` with `UNIQUE (copy_id)`. Rows exist iff the copy is currently out, the same invariant `card_trade_copies` keeps, so both exclusions stay bare `NOT EXISTS` checks. Pins are created when the loan is recorded: copies are auto-selected preferring the collection the lend action was triggered in, topping up from the lender's other collections. Only copies free of any claim (no live trade reservation, no other loan) qualify; if fewer than `quantity` are free, recording fails with an "only N available" error, mirroring trade accept. Trade accept gains the reverse check and skips loaned copies.

Deck-building availability subtracts pinned copies as a copy-level overlay on the existing collection-level flag: a lent copy is excluded even when its collection is marked available.

### Lifecycle

- **Record**: the lender creates the loan, active immediately, copies pinned. Naming a member creates a bell notification (the ADR-019 bell) with acknowledge and reject actions.
- **Acknowledge / reject** (member borrowers, orthogonal to status): unconfirmed loans show on the borrower's side but affect nothing. Acknowledging turns on their borrowed surfaces. Rejecting ("I don't have this") does not close the loan, the lender's card is still out; it flags the loan back to the lender, who can delete it or repoint the borrower to free text. Rejected loans vanish from the borrower's surfaces.
- **Return**: the lender marks any number of copies returned; that many pin rows are deleted and `returned_quantity` increments. At `returned_quantity = quantity` the loan closes as `returned`. The borrower never has to act.
- **Write-off**: for the card that is never coming back, whether the borrower keeps it by agreement or vanishes. Remaining pins are released, the loan closes as `written_off`, and the lender gets a one-sided proposal: remove the outstanding copies via `disposeCopies` (emitting collection events), or skip and fix manually. The borrower's side gets nothing, no trade record and no "add to your collection" proposal; if they actually have the card, adding it is on them.
- **Delete**: the lender can always delete a loan (mis-entry or unwanted history); pins release and it disappears from the borrower's view. It is a personal ledger, history is best-effort.

### Borrower surfaces

Acknowledged loans feed two read-only surfaces derived from the loans API (no phantom `copies` rows are ever created): a "Borrowed" section on the Loans page (printing, outstanding quantity, lender) and borrowed counts in the deck builder, shown distinctly ("2 owned + 1 borrowed") and buildable, but absent from owned stats, tradelist supply, and matching. Wishlist wants are deliberately not suppressed: borrowing a card is often the prelude to acquiring one.

### Shared views and badges

The lender sees an "on loan" badge on pinned copies across their own surfaces, with loan details behind it. Group members browsing a shared collection see the same badge without the borrower's identity; who has the card stays between lender and borrower.

### UI home

A personal Loans page with "Lent out" and "Borrowed" sections, grouped by borrower (member, or exact free-text name). The lend action lives in the card context menu on collection surfaces, with a quantity input and a borrower picker (co-members across the lender's groups, or free text). There is no per-group loans tab.

## Will Not Be Built

- **Deck-level lending.** Lending a deck is recording its cards individually. No batch action, no basket schema.
- **Due dates, reminders, notes.** Loans are open-ended; the ledger itself is the reminder.
- **Conversion to a trade or gift.** Write-off covers the data outcome on the lender's side; parties who want the borrower's collection updated edit it by hand.
- **Deposits, penalties, condition tracking, negotiation.** Same philosophy as ADR-019: the app coordinates, humans handle the terms.

## Deferred / Out of Scope

- **Borrower-initiated requests** ("may I borrow this?") against shared tradelists or collections, with accept flows and notifications.
- **Tracking cards borrowed from off-app people.** Requires non-owned phantom entries in the borrower's data model; deferred indefinitely.

## More Information

Builds on ADR-005 (copies and collections), ADR-013 (friend groups), and ADR-019 (reservation pins, the notification bell, and the coordination-not-enforcement stance). All forks resolved with the project owner on 2026-07-07.
