---
status: proposed
date: 2026-09-07
---

# ADR-045: Borrowed Cards in Deck Boxes

## Context and Problem Statement

A deck's box is a collection, and the Box tab fills it by moving copy rows into that collection (`useMoveCopies` in `deck-box-tab.tsx`). A borrowed card has no copy row in the borrower's account: ADR-039 records the loan on the lender's side, pins the lender's copies, and gives the borrower a derived read-only view. The Box tab therefore files borrowed cards under `missing` and reports "You don't own 3 cards", while the deck hero counts the same three copies as buildable through `useBorrowedCounts`. Two surfaces on one page contradict each other about the same cards. How does a borrowed card sit in a deck box?

## Decision Drivers

- ADR-039's two hard constraints: no phantom `copies` rows, and nothing written into another user's collections or lists without their action.
- ADR-039's promise that the borrower never has to act for the lender's data to be correct, which extends to loan closure leaving no borrower-side cleanup.
- A borrowed copy is physical and serves one box at a time. Two decks that run the card must not both count it.
- What "owned" means in collection counts, values, stats, exports, tradelist supply and trade matching does not change.
- Cards borrowed from people who are not OpenRift users have no loan row at all. ADR-039 deferred them indefinitely.

## Considered Options

- Placement rows: the borrower records that N borrowed copies sit in a collection
- Flagged copies: a borrowed card becomes a `copies` row marked not owned

## Decision Outcome

No decision yet.

What settles it is whether `copies` keeps its invariant that a row means the viewer owns the card. Placement rows keep the invariant and pay for it by making a box two-sourced. Flagged copies drop it and pay across every query that counts, prices, exports or offers a copy.

Two things to establish first. Whether a complete physical view of a box is wanted (a packing list, an export of the box collection), because that is the one surface placements leave incomplete. And whether the ownership filter can be made structural, for example by routing every ownership query through one helper in `query-helpers.ts`, which would turn the flagged-copies audit from a standing risk into a one-time change.

## Pros and Cons of the Options

### Placement rows

A table in the borrower's account:

```
borrowed_placements (
  id, user_id, collection_id, printing_id,
  loan_id uuid null references loans(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at, updated_at
)
```

`deck-box.ts` gains a borrowed slot state, ranked after `available` and before `blocked`, and its tick writes a placement where an owned slot's tick moves a copy. Nothing outside the box plan reads the table. A set `loan_id` ties the placement to an acknowledged loan and dies with it. A null `loan_id` records a quantity against a printing with no loan behind it.

- Good, because both ADR-039 constraints hold untouched: no `copies` row is created, and every write lands in the borrower's own account.
- Good, because a placement is exclusive, so a card borrowed once cannot be claimed by two boxes.
- Good, because loan closure is derived. A return, write-off or delete drops the placement and the box reopens the gap with no borrower action.
- Good, because the null-`loan_id` form reaches off-app borrows without the non-owned entries ADR-039 deferred. A placement is a quantity, never a copy, so it enters no ownership query.
- Neutral, because the box's collection page keeps showing owned copies only, and the borrowed cards live in the deck's Box tab. A collection page that listed them would be claiming cards the viewer does not own.
- Bad, because a box gains a second kind of content, so any later surface that means "what is physically in this box" has to union two sources.
- Bad, because the first tick costs a migration, a contract, an oRPC route, a repository and a service.

### Flagged copies

`copies` gains a nullable `borrowed_from_loan_id`, and a borrowed card becomes an ordinary row in whichever collection holds it. The Box tab, the move dialog and every other copy-level affordance work unchanged. This reverses ADR-039's no-phantom-rows stance and would supersede it.

- Good, because the box needs no new concept. A borrowed card in the box is in the box.
- Good, because the box's collection page, and any export of it, show the physical box.
- Good, because off-app borrows fall out of the shape: a flagged row needs no loan behind it.
- Bad, because ownership stops being "has a copy row". There are 25 `selectFrom("copies")` sites across eight modules in `apps/api/src`, and every site that forgets the filter is a silent leak: `lists.ts:641` turns copies into tradelist supply, `friend-group-matches.ts` into trade offers, `collections.ts` into `copyCount`, `totalValueCents` and `unpricedCopyCount`, `users.ts:53` into the profile card count, `catalog.ts` into owned-per-printing on card pages.
- Bad, because the client repeats the audit in `use-owned-count.ts`, `collection-grid.tsx`, `quick-add-palette.tsx`, `use-import-flow.ts`, `csv-export.ts`, and the personal-only rule in `use-stacked-copies.ts:47`, where the answer differs by scope: borrowed rows belong on the box's own page and not in the "All Cards" aggregate.
- Bad, because the tile's context menu is wrong by default on a borrowed copy. Lend, dispose, move and add-to-tradelist all assume the copy is the viewer's to promise or destroy, and `collection-card-context-menu.tsx` has to gate them one at a time.
- Bad, because it needs a borrowed chip wherever `OnLoanChip` renders (`collection-grid-cell.tsx:173`, `copy-metadata-badges.tsx:91`) and on `shared-collection-view.tsx`, or a shared collection presents a friend's cards as the viewer's.
- Bad, because loan closure forces a choice between two ADR-039 promises. Deleting the borrower's row when the lender marks a return writes into another user's collection, and leaving it makes the borrower clean up after an action they did not take.

## More Information

The Box tab is `apps/web/src/components/deck/deck-box-tab.tsx` over the plan in `apps/web/src/lib/deck-box.ts`, whose slot states are `in-box`, `available`, `blocked` and `missing`. The contradiction this record addresses is between that plan and `apps/web/src/hooks/use-deck-ownership.ts`, which counts borrowed copies as buildable through `useBorrowedCounts` (`apps/web/src/hooks/use-loans.ts:188`).

Off-app borrows stopped separating the two options once placements were allowed a nullable `loan_id`. ADR-039 deferred them on the reading that they require non-owned entries in the borrower's data model, which is true of a flagged copy and not of a placement quantity.

A smaller step sits under the placement option: a borrowed slot that renders read-only, naming the lender and filling no state, so the Box tab stops calling borrowed cards missing. It leaves the "Ready to play" badge unreachable for a deck built partly from borrowed cards, and it cannot stop two boxes claiming one copy.
