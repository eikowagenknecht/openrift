---
status: proposed
date: 2026-07-11
---

# ADR-020: Double-Sided Token Data Model

## Context and Problem Statement

Riftbound's newer sets ship physical cards with two distinct, gameplay-meaningful cards on each side, for example a Bird Token on one face and a Gold Token on the other, or a Gold Token paired with a Reflection Token. This breaks the implicit 1:1 relationship between `cards` and `printings` that the current schema relies on: a printing today belongs to exactly one card, and the back image (if any) is treated as decoration, not as a different card.

We need a data model that:

1. Lets each side of a double-sided physical card be a first-class card (browsable, searchable, ownable in the user's "I own N Gold Tokens" sense).
2. Keeps ownership, price, and trade-list semantics anchored to the physical piece of cardboard (one physical card → one unit of ownership, one price).
3. Doesn't break the existing user-facing vocabulary (cards = gameplay identity, printings = physical product).
4. Aggregates cleanly when the same logical card appears on multiple physical printings (the Gold Token side exists on Bird/Gold and on Gold/Reflection): owned counts and printing lists must sum across both products.

## Decision Drivers

- The physical card is one indivisible unit for ownership, price, and trade. Both sides move together.
- Each side has its own short_code, public_code, art, artist, printed text, language, rarity, finish, and signed-or-not, all of which can in principle differ between the two sides of the same physical card.
- The model must not record claims the physical product does not make. A double-sided token has no front: neither side is privileged by the rules or by the object itself, so the schema must not force an arbitrary front/back assignment.
- Invariants should be enforceable as plain database constraints. `uq_printings_identity` is one unique index today; its guarantee must survive the restructure.
- Users already understand "cards" (gameplay) vs. "printings" (physical). Adding a third user-facing term would be a regression.
- Future-proofing for transforming champions or other Riot-shipped multi-face layouts is a soft goal, not a hard requirement.
- Avoid widespread renames of existing tables, API routes, types, and slugs unless the rename actively pays for itself.

## Considered Options

### Model shape

1. **Add `back_card_id` to `printings`.** Smallest change. Each printing still belongs to one card, but may optionally point to a second card for the other side.
2. **Two paired printings linked by `paired_printing_id`.** Keep one printing per card, add a symmetric pair link, and teach the collection write path that owning one implies owning the other.
3. **A `faces` layer joined many-to-many via `printing_faces`, with cross-printing face dedup.** The 2026-05-13 draft's choice: split `printings` into a thin physical aggregator plus per-side `faces` rows, share one face row between printings when every printed attribute matches.
4. **A `faces` layer as plain children of `printings`.** Same two-level split as option 3, but each face belongs to exactly one printing (`faces.printing_id`). No join table, no dedup.

### Naming (assuming a faces layer)

A. **Rename `printings` → `printing_faces`; introduce a new `printings` = physical card.** Matches MTG/Scryfall convention but forces a massive rename across types, repos, routes, slugs, and tests.
B. **Keep `printings`; introduce `physical_printings` (with `physical_printing_faces`).** Minimal renaming, but the more important entity gets the longer, compound name.
C. **Keep `printings`; introduce `print_units`.** Short and abstract. "print" vs "printing" is one letter apart and gets misgrepped.
D. **Keep `printings` (narrowed schema); introduce `faces` as internal-only.** Names match the existing user-facing vocabulary; "face" never surfaces to users.

## Decision Outcome

**Model shape: faces as children of printings (option 4).** Options 1 and 2 fail for the reasons in Pros and Cons: option 1 leaves the second card without a printing of its own and a permanently different code path, option 2 duplicates every physical property across two rows and pushes "owning one implies owning the other" into application code. The real choice is between the two faces variants, and the join-table variant (option 3) loses on every axis that matters:

- The motivating aggregation case never needed shared face rows. "How many Gold Tokens do I own" walks `copies → printings → faces → cards` and sums every face whose `card_id` is the Gold Token; two face rows pointing at the same card produce the same result as one shared row.
- By option 3's own matching rule (identical short_code, public_code, and every other printed attribute), dedup likely never fires: collector codes are printed per product. If they ever do match, sharing saves one row and one image link.
- Shared face rows are shared mutable state: an edit to a deduped face silently changes other printings, which the admin flows would have to warn about.
- The identity constraint has no indexable home when the identity columns sit behind a join (see Identity constraint below).

**No front/back.** Faces carry a `position` (1 or 2) that means display order and nothing else. The convention is collector-code order: position 1 is the side whose printed code sorts first, derivable from the product with no human judgment. If a future product's rules genuinely privilege one side (a transforming champion with a defined starting face), that is new semantic information and gets its own column when the mechanic is known; `position` stays presentation-only.

**Naming: keep `printings`, introduce `faces` as an internal-only term (option D).** OpenRift already uses `cards` and `printings` precisely in the UI: cards are the gameplay-level identity, printings are the physical thing users own and see. The narrowing of the `printings` table exactly matches the meaning users already attach to the word; renaming it would break that alignment for no gain. `faces` never appears in user copy, and neither do "front" or "back".

### Consequences

- Good, because user-facing vocabulary is unchanged and the cards-vs-printings distinction users already understand is preserved.
- Good, because the shared-card case (Gold Token on two products) needs no special mechanism: both faces point at the same `cards` row and every count and listing aggregates through that link.
- Good, because attributes live at their correct level: gameplay properties on `cards`, printed-side properties on `faces`, physical-product properties on `printings`, ownership on `copies`.
- Good, because `uq_printings_identity` ports to `faces` as a plain unique index, and "at most two sides" is a unique-plus-check pair, with no triggers or app-level counting.
- Good, because every read path takes one join fewer than the join-table variant, and the backfill is mechanical (one face row per existing printing).
- Good, because the model future-proofs against further multi-face products without another schema redesign, and if a genuine shared-face need ever appears, extracting a join table later is a forward migration (collapsing one back is not).
- Bad, because `printings` keeps its name but most of its columns move down to `faces`: developers with the old mental model will reach for `printings.short_code` and find it gone.
- Bad, because when the same logical side ships on several products, its printed content and image links exist once per face row with no schema-level sync guarantee. Accepted: this is admin-curated catalog data, and the rows may legitimately differ (per-product collector codes).
- Bad, because the client dataset shape changes to one entry per face, and any surface that counts printings must count distinct `printing_id` rather than entries.
- Bad, because every existing single-sided printing needs a backfill that creates a face row.

### Confirmation

- Schema review against `docs/schema.sql` after the migration: `printings` reduced to the physical-product set; `faces` exists keyed by `printing_id` with `position`; `printing_images` renamed to `face_images` keyed by `face_id`; the identity unique index lives on `faces`.
- Repository-level audit: no callsite reads moved columns from `printings` directly.
- User-facing copy audit: "face", "front", and "back" appear in no user-visible string for this feature; pairing copy is neutral ("double-sided, with Bird Token").
- Functional check: importing a Bird/Gold printing and a Gold/Reflection printing yields four face rows, two of which point at the Gold Token card; the owned count for Gold Token sums copies of both printings.

## Design Decisions

### The layers

```
cards  ←  faces  →  printings  ←  copies
          (printing_id, position)
```

- **`cards`** (existing, unchanged): abstract gameplay identity. One row per card name. Holds gameplay properties.
- **`faces`** (new): one printed side. Belongs to exactly one printing (`printing_id`), points to exactly one card (`card_id`). `UNIQUE (printing_id, position)` with `CHECK (position IN (1, 2))` caps a printing at two sides.
- **`printings`** (existing, schema thinned): the physical piece of cardboard. Has one or two faces. Unit of ownership, price, and trade.
- **`copies`** (existing, unchanged): one row per physical card a user owns. References `printing_id`. Ownership semantics unchanged.

### Attribute placement

| Table       | Columns                                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards`     | name, slug, norm_name, type, might, energy, power, might_bonus, keywords, tags, editorial comment                                                                                                                                |
| `faces`     | printing_id, position, card_id, short_code, public_code, art_variant, artist, printed_name, printed_rules_text, printed_effect_text, flavor_text, language, rarity, printed_year, finish, is_signed, marker_slugs, → face_images |
| `printings` | set_id, size, comment (pending open question 3)                                                                                                                                                                                  |
| `copies`    | (unchanged) user_id, collection_id, printing_id, created_at, updated_at                                                                                                                                                          |

Most of today's `printings` columns move down to `faces` because they describe one printed side: codes, art, artist, printed text, language, rarity, year, finish, signed status, markers. Rarity stays per-face deliberately: it is printed via a symbol on each side, and both sides sharing it in practice is data, not schema.

What stays on `printings` is the physical-product set: `set_id` and `size` (`size` landed on `printings` after the first draft of this ADR; a card's physical dimensions are a property of the cardboard, not of a side). There are no price columns to keep: prices live in `marketplace_product_prices` via `marketplace_product_variants`, both keyed per physical printing, and are untouched by this change.

### Position, not front/back

A double-sided token has no front. Neither the rules nor the physical object privileges a side, so any front/back assignment would store an arbitrary decision as if it were a fact. `position` therefore means display order only:

- Position 1 is the side whose printed collector code sorts first. The admin form applies this by default; no one ever decides which side is "front" because the model no longer asks.
- Single-sided printings have one face at position 1.
- The display name of a double-sided printing joins both card names in position order with " // " ("Bird Token // Gold Token").
- User copy describes the pairing neutrally: a card's printings list annotates a double-sided entry as "double-sided, with Bird Token", never "back of Bird Token".

### Why no cross-printing face dedup

The first draft shared one face row between printings when every printed attribute matched, motivated by the Gold Token case. Dropped:

- No query needs it. Aggregation happens at the `cards` level; separate face rows with the same `card_id` answer every count and listing identically.
- Under the matching rule it likely never fires anyway, since each product prints its own collector codes. When codes do match, sharing saves one row and one image link.
- It creates shared mutable state across printings and drags dedup hints, "shared with N printings" warnings, and a faces audit page into the admin flows.
- Scryfall, the closest prior art, does not dedup either: their `card_faces` belong to exactly one card object.

### Identity constraint

Today `uq_printings_identity` is `UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language, size)` on `printings`, and other work (ADR-015) leans on "finish is part of a printing's identity". The constraint ports to `faces` as `UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language)`.

`size` stays on `printings` and leaves the index. Against current data this loses nothing: every printing is `standard` and the reduced column set has zero collisions. If an oversized variant ever shares every printed attribute with a standard printing, either `size` joins `faces` (denormalized) or the check moves to the writer path; decide when the product exists.

This constraint is a reason option 4 beat option 3: with the identity columns behind a join table, "no two printings with identical face sets" is an aggregate condition that no index can express.

### Image storage

`printing_images` is renamed to `face_images` and re-keyed to `face_id`. The `face` text column (`'front' | 'back'`) goes away: the face row is the discriminator, and current data holds no back-face images at all (3308 front rows, zero back), so nothing is lost in the mapping. Foil and non-foil are separate faces with their own `face_images` rows; when they share a scan they may point at the same `image_file_id`. When the same logical side exists on two products, each face carries its own image rows.

### Client dataset shape

ADR-009 ships the catalog to the browser and filters client-side, today as one entry per printing carrying the printed attributes. That shape becomes one entry per face:

- A single-sided printing produces exactly today's entry.
- A double-sided printing produces two entries, each carrying its own printed attributes plus the pairing (the shared `printing_id`, the paired card's name, its own `position`).
- Filters (language, rarity, finish, ...) keep operating per entry unchanged, and both sides become searchable, which is requirement 1.
- Owned counts key on `printing_id`, so both entries of one printing show the same count. Any surface that counts printings (stats, totals, "N printings" badges) must count distinct `printing_id`, not entries.

This confines the refactor to the API read layer and the payload types; the browse surfaces keep their per-entry logic.

### Thumbnails

Each face has its own images, so a card's thumbnail is simply the image of whichever of its faces the existing printing-selection rules pick. `position` never enters the choice.

### User-facing vocabulary

Unchanged. Users continue to see:

- **"card"** = gameplay identity (`cards` row).
- **"printing"** = physical product (`printings` row).
- **"copy"** = an instance they own (`copies` row).
- **"face"**, **"front"**, **"back"** = never appear in user copy.

What changes for users when double-sided tokens land:

- Card detail pages list more printings: a card's printings list includes every printing where the card appears on either side, with double-sided entries annotated with their pairing.
- Printing detail pages for double-sided tokens render both sides side-by-side or with a flip toggle.
- Aggregate counts ("how many Gold Tokens do I own") include both Bird/Gold and Gold/Reflection physical cards via the face → card link.

### Admin UI changes

- **Cards list page**: unchanged.
- **Card detail page**: the printings list annotates double-sided printings with their pairing.
- **Add printing flow**: becomes a small wizard with the ability to add a second face. Single-sided cards collapse to one screen with one face row, visually almost identical to today. No dedup hint: faces are never shared.
- **Printing detail page**: for two-faced printings, renders both sides with their own face-edit panels.
- **Candidate review queue**: gains a "pair candidates" action. The reviewer can pick a second scraped candidate to combine into one two-faced printing before promoting.

The first draft's hidden faces admin page (a flat list for dedup audits) is dropped along with dedup.

## Pros and Cons of the Options

### Option 1: `back_card_id` on `printings`

- Good, because the migration is trivial (one nullable column) and renames nothing.
- Bad, because the second card has no printing of its own, so searching it, computing its owned count, or showing it in the card list requires a permanently different code path. The asymmetry leaks into every query that needs both sides equally.
- Bad, because there's no path to handle future multi-face products without re-doing the model.

### Option 2: Paired printings via `paired_printing_id`

- Good, because each card keeps its own searchable, ownable printing row, and the migration is small.
- Bad, because the two printing rows for one physical card duplicate every physical field (set, size, price linkage), risking drift.
- Bad, because the collection write path must enforce "owning one implies owning the other" in application code, with no schema-level guarantee.
- Bad, because price is per physical card but the model gives each side its own marketplace linkage, requiring synthesis logic everywhere.

### Option 3: `faces` layer with `printing_faces` join and dedup

- Good, because attributes live at the same correct levels as option 4.
- Good, because a hypothetical shared face exists exactly once.
- Bad, because dedup solves no query the face → card link doesn't already solve, and by its own matching rule likely never fires.
- Bad, because the identity constraint is not expressible as an index when its columns sit behind a join.
- Bad, because shared face rows are shared mutable state, with edit-leak warnings and dedup hints spreading through the admin and import flows.
- Bad, because every read path pays one extra join and the backfill needs join rows.

### Option 4: `faces` as children of `printings` (chosen)

- Good, because it keeps option 3's clean attribute placement with one join fewer, plain-index constraints, and a mechanical backfill.
- Good, because extracting a join table later (should a real shared-face need appear) is a forward migration; collapsing a many-to-many back into a child table is the painful direction.
- Bad, because the same logical side on several products means duplicated face rows and image links with no schema-enforced sync.
- Bad, because the migration is still large: most `printings` columns move, and every consumer of them changes.

### Naming sub-options

The chosen sub-option (D, keep `printings`, add `faces` as internal-only) matches the existing vocabulary at no rename cost: no existing API routes, slugs, types, or fixtures change name, only column placement.

Option A (rename `printings` → `printing_faces`, new `printings` = physical) would have produced the most Scryfall-aligned end state but at very high rename cost across the entire codebase, including URL slugs that are user-visible.

Option B (`physical_printings`) was rejected because the more important entity (the unit of ownership) shouldn't have the longer, awkward compound name.

Option C (`print_units`) was rejected because "print" vs "printing" is one letter apart and would be misread, misgrepped, and mistyped indefinitely.

## Schema

Sketch only; exact migration SQL drafted at implementation time.

```
cards            (unchanged columns)
faces            id, printing_id, card_id, position, short_code, public_code,
                 art_variant, artist, printed_name, printed_rules_text,
                 printed_effect_text, flavor_text, language, rarity,
                 printed_year, finish, is_signed, marker_slugs,
                 created_at, updated_at
                 UNIQUE (printing_id, position)
                 CHECK (position IN (1, 2))
                 UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish,
                                            marker_slugs, language)
printings        id, set_id, size, comment?, created_at, updated_at
face_images      (renamed from printing_images) id, face_id, is_active,
                 image_file_id, created_at, updated_at
copies           (unchanged)
```

Constraints worth specifying at schema time:

- At most two faces per printing: the `UNIQUE (printing_id, position)` + `CHECK` pair.
- Every printing has a position-1 face: a cross-table invariant, enforced on the writer path (creation inserts printing and face in one transaction; face deletion refuses to remove the last face).
- The identity index above, porting `uq_printings_identity` (see Design Decisions for the `size` caveat).
- `face_images` unique indexes mirror today's `printing_images` indexes, keyed by `face_id`, minus the dropped `face` column.

## Migration shape

1. Create `faces`.
2. Create `face_images` (target of the `printing_images` rename).
3. Backfill: for each existing `printings` row, insert one `faces` row at position 1 with the moved columns, and re-key its `printing_images` rows to `face_images` (current data holds zero back images, so the mapping is 1:1).
4. Drop migrated columns from `printings`.
5. Drop `printing_images`.
6. Update repositories (`apps/api/src/repositories/`) to read through `faces`.
7. Update server functions, route handlers, and types in `packages/shared`.
8. Rework the catalog payload to entry-per-face (see Client dataset shape).
9. Card detail pairing annotation; printing detail two-side rendering.
10. Admin add-second-face wizard step and the candidate "pair candidates" action.
11. Regenerate `docs/schema.sql` (`bun db:schema`).

Adjacent tables, classified per-physical vs per-side (every `printing_id` consumer in today's schema):

- **Stay per-physical, keyed on `printing_id`, untouched:** `copies`, `collection_events`, `card_trades`, `loans`, `list_entries`, `deck_cards.preferred_printing_id`, `deck_check_entry_cards.resolved_printing_id`, `product_printings`, `marketplace_product_variants` (and through it `marketplace_product_prices`, `marketplace_product_card_overrides`), `printing_link_overrides`, `printing_sources`, `printing_distribution_channels`, `printing_events`.
- **Review during implementation, likely per-side:** `art_variants`, `printing_markers` (reconcile with the `marker_slugs` column moving to `faces`), `card_errata` (errata concerns printed text, which is per-side).
- **Depends on open question 1:** `candidate_printings`, `ignored_candidate_printings`.

## Open Questions

1. **`candidate_printings` shape.** Do scraper sources present double-sided tokens as one product or as two separate listings (one per side)? Determines whether `candidate_printings` keeps its current shape (with face-split at review time via the pairing action) or gains a `candidate_faces` child. Survey the sources before locking the intake model.
2. **Deck slot reference.** Deck slots keep referencing `printing_id`. Tokens aren't in decks, so this is moot today; revisit if Riftbound ships a multi-face product whose rules privilege a side, which would also introduce the semantic side column `position` deliberately doesn't carry.
3. **`printings.comment`.** With nearly all per-printing properties moving to `faces`, tentatively drop it; per-copy observations belong on `copies` if condition tracking lands.

Resolved since the first draft: existing back images (none exist in the data, resolved 2026-07-11), default thumbnails (each face owns its images, so no face-preference rule is needed), rarity placement (per-face, printed on each side), image sharing across treatments (separate faces with own rows, shared `image_file_id` allowed), and display naming (" // " in position order).

## More Information

- ADR-005 (Collection Tracking Data Model) defines `copies` and the event-based ownership ledger that this change must remain compatible with. No changes to `copies` semantics are required.
- Scryfall's API documents the same conceptual split: their "Card" object is what we call a printing, their `card_faces[]` (belonging to exactly one card object, never shared) is what we call faces, and their `oracle_id` is our abstract `cards` grouping. Their `double_faced_token` layout maps directly to our motivating case. See <https://scryfall.com/docs/api/layouts> and <https://scryfall.com/docs/api/cards>.
- First proposed 2026-05-13 with a `printing_faces` join table, cross-printing face dedup, and front/back sides. Revised 2026-07-11 after review: faces became children of printings (dedup and the join table dropped), front/back was replaced by a presentation-only position in collector-code order, the schema drift since May was folded in (`size` on printings, prices living in the marketplace tables, zero stored back images), and the client dataset shape was decided.
- The decision to keep `printings` as the table name is conditional on the user-facing vocabulary staying as it is today. If a future product decision moves OpenRift away from exposing the word "printing" to users, the naming choice should be revisited.
