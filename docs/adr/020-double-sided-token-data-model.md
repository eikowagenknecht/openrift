---
status: proposed
date: 2026-05-13
---

# ADR-020: Double-Sided Token Data Model

## Context and Problem Statement

Riftbound's newer sets ship physical cards with two distinct, gameplay-meaningful cards on each side — for example a Bird Token on one face and a Gold Token on the other, or a Gold Token paired with a Reflection Token. This breaks the implicit 1:1 relationship between `cards` and `printings` that the current schema relies on: a printing today belongs to exactly one card, and the back image (if any) is treated as decoration, not as a different card.

We need a data model that:

1. Lets each side of a double-sided physical card be a first-class card (browsable, searchable, ownable in the user's "I own N Gold Tokens" sense).
2. Keeps ownership, price, and trade-list semantics anchored to the physical piece of cardboard (one physical card → one unit of ownership, one price).
3. Doesn't break the existing user-facing vocabulary (cards = gameplay identity, printings = physical product).
4. Handles the killer case where the **same** logical card appears on multiple physical printings (the Gold Token face exists on Bird/Gold and on Gold/Reflection).

## Decision Drivers

- The physical card is one indivisible unit for ownership, price, and trade — both sides move together.
- Each side has its own short_code, public_code, art, artist, printed text, language, rarity, finish, and signed-or-not, all of which can in principle differ between the two sides of the same physical card.
- Users already understand "cards" (gameplay) vs. "printings" (physical). Adding a third user-facing term would be a regression.
- Future-proofing for transforming champions or other Riot-shipped multi-face layouts is a soft goal, not a hard requirement.
- Avoid widespread renames of existing tables, API routes, types, and slugs unless the rename actively pays for itself.

## Considered Options

### Model shape

1. **Add `back_card_id` to `printings`** — smallest change. Each printing still belongs to one card (front), but may optionally point to a second card for the back.
2. **Two paired printings linked by `paired_printing_id`** — keep one printing per card, add a symmetric pair link, and teach the collection write path that owning one implies owning the other.
3. **Introduce a `faces` layer between `cards` and `printings`** — split today's `printings` table into a thin physical aggregator (`printings`) plus a per-side artifact (`faces`), connected by a `printing_faces` join. A printing has 1 or 2 faces; each face points to one card.

### Naming (assuming option 3)

A. **Rename `printings` → `printing_faces`; introduce a new `printings` = physical card.** Aligns with MTG/Scryfall convention but forces a massive rename across types, repos, routes, slugs, and tests.
B. **Keep `printings`; introduce `physical_printings` (with `physical_printing_faces`).** Minimal renaming, but the more important entity gets the longer, compound name.
C. **Keep `printings`; introduce `print_units`.** Short and abstract; "print" vs "printing" is one-letter and gets misgrepped.
D. **Keep `printings` (narrowed schema); introduce `faces` as internal-only.** Names match the existing user-facing vocabulary; "face" never surfaces to users.

## Decision Outcome

**Chosen option for the model shape: option 3 — introduce a `faces` layer.**

Option 1 (`back_card_id`) leaves a permanent asymmetry: the back card has no printing of its own, so queries from the back-card side require a separate code path forever. Option 2 (paired printings) preserves symmetry but conflates two ideas — "the printed side" and "the physical product" — that the new requirement forces us to separate. Option 3 is the only model that handles the killer case (same logical card appearing as the back of one printing and the front of another, e.g. Gold Token across Bird/Gold and Gold/Reflection) cleanly via dedup, and the only one that future-proofs for any further multi-face treatments Riot ships.

**Chosen option for the naming: option D — keep `printings`; introduce `faces` as internal-only.**

OpenRift already uses `cards` and `printings` precisely in the UI: cards are the gameplay-level identity, printings are the physical thing users own and see. The narrowing of the `printings` table (most columns move down to `faces`) exactly matches the meaning users already attach to the word "printing." Renaming `printings` to anything else would break that alignment for no semantic gain. `faces` is an internal-only term and never appears in user copy; UI continues to speak only of cards and printings.

### Consequences

- Good, because user-facing vocabulary is unchanged and the cards-vs-printings distinction users already understand is preserved.
- Good, because the killer case (Gold Token shared as back of one printing and front of another) is modeled naturally via face dedup.
- Good, because attributes finally live at their correct level: gameplay properties on `cards`, printed-side properties on `faces`, physical-product properties on `printings`, ownership/instance properties on `copies`.
- Good, because the model future-proofs against further multi-face products (transforming champions, modal cards) without another schema redesign.
- Bad, because `printings` keeps its name but most of its columns move down to `faces` — developers with the old mental model will reach for `printings.short_code` and find it gone. There is no way to avoid this without breaking the user-facing alignment.
- Bad, because face dedup adds non-trivial logic to the import / admin flows: when adding a printing, the system must check whether each face's printed content matches an existing face and offer to reuse it.
- Bad, because every existing single-sided printing needs a backfill that creates a face row and a `printing_faces` join row.

### Confirmation

- Schema review against `docs/schema.sql` after the migration: `printings` columns reduced to the physical-aggregator set; `faces` and `printing_faces` exist; `printing_images` renamed to `face_images` keyed by `face_id`.
- Repository-level audit: no callsite reads moved columns from `printings` directly.
- User-facing copy audit: the word "face" appears in no user-visible string. Search the `apps/web` source for the term as a check.
- Functional check: importing a Bird/Gold token printing and a Gold/Reflection printing results in exactly one shared Gold Token face row, referenced from both printings via `printing_faces` with the appropriate `side` value.

## Design Decisions

### The four layers

```
cards  ←  faces  ←  printing_faces  →  printings  ←  copies
                       (join)                       (existing)
```

- **`cards`** (existing, unchanged) — abstract gameplay identity. One row per card name. Holds gameplay properties.
- **`faces`** (new) — one unique printed-side artifact. Each face points to exactly one card. A face may be referenced by multiple printings (dedup).
- **`printings`** (existing, schema thinned) — the physical piece of cardboard. Aggregates 1 or 2 faces. Unit of ownership, price, and trade.
- **`printing_faces`** (new join) — `(printing_id, face_id, side)` with `side ∈ {front, back}`. One row per face per printing.
- **`copies`** (existing, unchanged for this ADR) — one row per physical card a user owns. References `printing_id`. Ownership semantics unchanged.

### Attribute placement

| Table            | Columns                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cards`          | name, slug, norm_name, type, might, energy, power, might_bonus, keywords, tags, editorial comment                                                                                                                  |
| `faces`          | card_id, short_code, public_code, art_variant, artist, printed_name, printed_rules_text, printed_effect_text, flavor_text, language, rarity, printed_year, finish, is_signed, marker_slugs, comment, → face_images |
| `printings`      | set_id, price aggregations                                                                                                                                                                                         |
| `printing_faces` | printing_id, face_id, side ('front' / 'back')                                                                                                                                                                      |
| `copies`         | (unchanged) user_id, collection_id, printing_id, created_at, updated_at                                                                                                                                            |

Most of today's `printings` columns move down to `faces`. The columns that stay on `printings` are essentially `set_id` (could be derived from faces, kept for query convenience) plus price aggregations. `printings` becomes a thin aggregator whose job is "group 1–2 faces into one ownable, priceable physical product."

### Per-face placement of formerly per-printing attributes

The following columns are per-face and move from `printings` to `faces`:

- **`short_code`, `public_code`** — each printed side has its own code (Bird Token side reads OGN-T1, Gold Token side reads OGN-T2 on the same physical card).
- **`is_signed`** — a signature is on one specific side. A printing could in principle have a signed front and unsigned back.
- **`finish`** — foil and non-foil treatments apply per side. A printing can have a foil front and non-foil back.
- **`art_variant`, `artist`** — art is per side.
- **`printed_name`, `printed_rules_text`, `printed_effect_text`, `flavor_text`** — printed text is per side.
- **`language`** — printed text differs per language, so language is implicitly per-face. (A printing's faces are normally all in the same language, but the property lives on the face.)
- **`rarity`** — printed via a rarity symbol on each side. Both sides of a double-sided printing usually share rarity, but it's a face-level printed attribute.
- **`printed_year`** — the face artifact has a year.
- **`marker_slugs`** — markers are printed on the face.

### Face dedup rules

A face is **the same** when every printed property on the side is identical: same card, short_code, public_code, art_variant, artist, printed text in the same language, rarity, year, finish, is_signed status, markers. Any difference creates a new face row.

Practical dedup cases:

- **Foil + non-foil of the same card within a set** → different faces (finish differs). No dedup at the face level; dedup happens at image/text via `face_images` reuse only.
- **Same card appearing as back of one printing and front of another (the Gold Token case)** → same face. One face row, referenced from two printings via `printing_faces` with different `side` values. This is the killer case the redesign exists for.
- **Reprint in a later set** → different faces (`short_code` differs, often other things too).
- **Signed variant** → different face (`is_signed` differs).
- **Alt art / borderless** → different face (`art_variant` differs).

### Side as a join property

`side` lives on `printing_faces`, not on `faces`. A face has no intrinsic side — it can be the front in one printing and the back in another. The role is per-printing.

### Image storage

`printing_images` is renamed to `face_images` and re-keyed to `face_id`. The `face` text column (`'front' | 'back'`) on `printing_images` goes away — the face row is itself the discriminator. Foils and non-foils that share a face share images. When a face is referenced by multiple printings, editing its image affects all of them; the admin UI must flag this.

### User-facing vocabulary

Unchanged. Users continue to see:

- **"card"** = gameplay identity (`cards` row).
- **"printing"** = physical product (`printings` row).
- **"copy"** = an instance they own (`copies` row).
- **"face"** = never appears in user copy.

What changes for users when double-sided tokens land:

- Card detail pages list more printings: the "Printings" section joins through `faces`, so a card's printings list includes every printing where this card appears as any face. A new `role` column ("front" / "back of [other card]") communicates which side, only meaningful for double-sided tokens.
- Printing detail pages for double-sided tokens render both sides side-by-side or with a flip toggle.
- Aggregate counts ("how many Gold Tokens do I own") naturally include both Bird/Gold and Gold/Reflection physical cards via the face join. Counts walk `copies → printings → faces → cards` and surface a single card-level total.

### Admin UI changes

- **Cards list page** — unchanged.
- **Card detail page** — the printings list gains a `role` column showing which side this card is on each printing.
- **Add printing flow** — becomes a small wizard with the ability to add a second face. Single-sided cards collapse to one screen with one face row, visually almost identical to today. The face form includes a dedup hint: as the admin enters `short_code`, the system checks for matching faces and offers "use existing face (currently on printing X)" — explicit, not silent.
- **Printing detail page** — for two-faced printings, renders both sides with their own face-edit panels. A "this face is shared with N other printings" indicator surfaces when dedup applies.
- **Candidate review queue** — gains a "pair candidates" action: the reviewer can pick a second scraped candidate to pair as the back face of one printing before promoting.
- **Faces admin page (optional, hidden from main nav)** — a flat list of all faces for dedup audits. Not part of routine editing.

### What stays the same in admin

- Cards listing, search, edit.
- The general feel of card detail (just one extra column).
- The single-sided add-printing flow (one face row, looks like today).

### What's genuinely new in admin

- "Add second face" affordance on the printing form.
- Two-face layout on the printing detail page.
- "Pair candidates" action in the candidate review queue.
- Dedup hint on face creation.
- Optional faces admin page for audits.

## Pros and Cons of the Options

### Option 1: `back_card_id` on `printings`

- Good, because the migration is trivial (one nullable column).
- Good, because no rename of existing tables.
- Neutral, because face dedup is unsupported but not strictly needed for the immediate problem.
- Bad, because the back card has no printing of its own — searching the back card, computing its owned count, or showing it in the card list requires a permanently different code path from front cards.
- Bad, because the asymmetry leaks into every query that needs both sides equally (collection counts, card detail pages, deck builder, search).
- Bad, because there's no path to handle future multi-face products without re-doing the model.

### Option 2: Paired printings via `paired_printing_id`

- Good, because each card keeps its own searchable, ownable printing row.
- Good, because the migration is small (one column on `printings`).
- Neutral, because the symmetry is preserved.
- Bad, because the two printing rows for one physical card duplicate every field (set, finish, price), risking drift.
- Bad, because the collection write path must enforce "owning one implies owning the other" in application code, with no schema-level guarantee.
- Bad, because price is per-physical-card but the model gives each face its own price row, requiring synthesis logic everywhere.
- Bad, because the conflation between "printed side" and "physical product" persists, leaving the next multi-face product to break the model again.

### Option 3: `faces` layer (chosen)

- Good, because attributes finally live at their correct level and never duplicate.
- Good, because face dedup handles the same-card-across-printings case cleanly with one row.
- Good, because future multi-face products fit the model without further schema changes.
- Good, because the user-facing vocabulary is unchanged.
- Bad, because the migration is the largest of the three options.
- Bad, because `printings.short_code` and related columns disappear; developers with the old mental model need to adjust.
- Bad, because face dedup requires admin-flow logic (check-for-existing-face on import).

### Naming sub-options

The chosen sub-option (D — keep `printings`, add `faces` as internal-only) was picked because:

- `printings` in the new schema means exactly what users mean by "printing" (the physical product). Names match meaning.
- `faces` is never a user-facing word, so its naming only needs to be developer-clear.
- Rename cost is minimized: no existing API routes, slugs, types, or fixtures need to change name (only column placement).

Option A (rename `printings` → `printing_faces`, new `printings` = physical) would have produced the most Scryfall-aligned end state but at very high rename cost across the entire codebase, including URL slugs that are user-visible.

Option B (`physical_printings`) was rejected because the more important entity (the unit of ownership) shouldn't have the longer, awkward compound name.

Option C (`print_units`) was rejected because "print" vs "printing" is one letter apart and would be misread, misgrepped, and mistyped indefinitely.

## Schema

Sketch only; exact migration SQL drafted at implementation time.

```
cards                (unchanged columns)
faces                id, card_id, short_code, public_code, art_variant, artist,
                     printed_name, printed_rules_text, printed_effect_text,
                     flavor_text, language, rarity, printed_year, finish,
                     is_signed, marker_slugs, comment, created_at, updated_at
printings            id, set_id, comment?, price aggregations, created_at, updated_at
printing_faces       printing_id, face_id, side ('front' | 'back')
                     PK (printing_id, face_id, side) or surrogate id; unique on
                     (printing_id, side) so a printing has at most one front
                     and one back
face_images          (renamed from printing_images) id, face_id, provider,
                     is_active, image_file_id, created_at, updated_at
copies               (unchanged)
```

Constraints worth specifying at schema time:

- A printing has at least one face (a `front` row in `printing_faces` is required).
- A printing has at most two faces (one front, one back).
- Composite uniqueness preventing two distinct printings from having identical face sets (catches data-entry duplication).
- `face_images` unique indexes mirror today's `printing_images` indexes, keyed by `face_id` instead.

## Migration shape

1. Create `faces` and `printing_faces` tables.
2. Create `face_images` table (target of the `printing_images` rename).
3. Backfill: for each existing `printings` row, insert one `faces` row with the moved columns, one `printing_faces` row (front), and one `face_images` row per existing `printing_images` row (mapping `face = 'front' | 'back'` accordingly — though today's back images are decorative, so the mapping might just keep them as separate face images of the same face). Confirm at implementation time whether existing back images in `printing_images` are decorative card-backs or unique-back-art champions that need their own face rows.
4. Drop migrated columns from `printings`.
5. Drop `printing_images`.
6. Update repositories (`apps/api/src/repositories/`) to read through `faces` where appropriate.
7. Update server functions, route handlers, and types in `packages/shared`.
8. Update card detail page printing list to join through `faces` and render the new `role` column.
9. Update printing detail page to render both sides for two-faced printings.
10. Add "add second face" to the admin printing form, dedup hint, and "pair candidates" action.
11. Regenerate `docs/schema.sql`.

Adjacent areas that need review during implementation (not all necessarily change):

- `candidate_printings` — depends on whether sources (TCGplayer, CardMarket, Riot) present double-sided tokens as one product or two. Worth a survey before locking the intake model.
- `art_variants`, `printing_markers`, `printing_distribution_channels`, `printing_events`, `printing_link_overrides`, `card_errata`, `marketplace_product_card_overrides`, `marketplace_product_variants` — each touches the printing concept. For each, determine whether the data is per-physical-card (stays on `printings`) or per-face (moves to `faces`).

## Open Questions

These should be resolved before or during implementation:

1. **`candidate_printings` shape.** Do scraper sources present double-sided tokens as one product (per physical card) or as two separate listings (one per face)? Determines whether `candidate_printings` keeps its current shape (with face-split at import) or gains a `candidate_faces` child.

2. **Deck slot reference.** Today deck slots reference `printing_id`. For tokens this is moot (tokens aren't in decks), but if Riftbound ships transforming champions, deck slots may need to reference `face_id` to communicate which side is the deck-legal one. Keep as `printing_id` for now; revisit when the first non-token multi-face product ships.

3. **`printings.comment`.** With nearly all per-printing properties moving to `faces`, is there anything left for a per-physical-product comment that isn't either a face property or a per-copy observation? Tentatively: drop `printings.comment`. Move per-copy observations to `copies.comment` if/when condition tracking lands.

4. **Primary face selection for thumbnails.** When a card appears on multiple printings as different sides, which face image is the default thumbnail on the card list page? Tentatively: prefer any face where this card is the front of a printing; fall back to back-of.

5. **Existing back-face images.** `printing_images` already has a `face = 'back'` capability used for cards whose back is decorative or champion-specific. During migration, are those back images carried over as their own face rows (with synthetic card identity?) or kept as additional images on the front face? Needs investigation of current data before deciding.

6. **Rarity per face vs. per printing.** Rarity is printed on each side, but in practice both sides of a double-sided card always share rarity. Storing rarity on `faces` is faithful to where it's printed; storing it on `printings` would be marginally simpler. Tentative: keep on `faces` to match printed reality and allow future variation.

7. **Face image sharing across treatments.** When foil and non-foil printings share a face, do they always share images, or do we sometimes want separate scans (e.g. one with foil glare visible)? Tentative: one canonical image per face; if needed later, add a `treatment` column to `face_images`.

8. **Display name of a double-sided printing.** "Bird/Gold Token", "Bird Token // Gold Token", or just the front card's name? Affects breadcrumbs, search results, trade list rows. Needs a small style decision.

## More Information

- ADR-005 (Collection Tracking Data Model) defines `copies` and the event-based ownership ledger that this ADR's `printings → faces` change must remain compatible with. No changes to `copies` semantics are required.
- Scryfall's API documents the same conceptual split: their "Card" object is what we call a printing, their `card_faces[]` is what we call faces, and they use an `oracle_id` field as the abstract card grouping (what we call `cards`). Their `double_faced_token` layout maps directly to our motivating case. See <https://scryfall.com/docs/api/layouts> and <https://scryfall.com/docs/api/cards>.
- The decision to keep `printings` as the table name (rather than renaming) is conditional on the user-facing vocabulary staying as it is today. If a future product decision moves OpenRift away from exposing the word "printing" to users, the naming choice should be revisited.
