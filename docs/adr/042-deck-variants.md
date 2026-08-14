---
status: accepted
date: 2026-08-14
---

# ADR-042: Deck Variants and Checkpoints

## Context and Problem Statement

A deck is one live list: every edit autosaves into `decks` + `deck_cards`, so there is no record of what the list looked like before a rebuild, and no way to keep a budget build next to the full build except Duplicate, which produces an unlinked copy that drifts silently. Players iterate constantly (post-rotation rebuilds, tournament lists, budget versions) and asked for two things: named checkpoints ("the list I played at the store event") and parallel variants, each optionally marked as a draft, with a "show changes" view between them. Automatic edit history was considered and explicitly rejected as uninteresting. How do we model versions without a second storage path or a second editor?

## Considered Options

1. Variants as full decks in a family, lineage via a predecessor pointer (chosen)
2. Split model: immutable snapshot table for checkpoints, linked real decks for variants
3. One deck row owning many version rows, with a version dimension through the editor
4. Checkpoints as locked deck rows

## Decision Outcome

Every variant is an ordinary deck. Four columns on `decks` carry the whole feature: `family_id` (uuid, null for standalone decks) groups variants, `predecessor_deck_id` (uuid, FK to `decks`, ON DELETE SET NULL) expresses lineage, `is_primary` marks the variant that fronts the family (one per family via partial unique index), and `is_draft` is a lifecycle badge. Because a variant is a deck, the editor, plans, ownership panel, wants, share tokens, and formats all work per variant with zero changes, and a 2v2 or budget variant legitimately owns its own plan notes and share link.

"Checkpoint" is a verb, not a storage type: copy the current variant (cards, preferred printings, plans, matchup plans) into a new row and point the live deck's `predecessor_deck_id` at the copy. The live deck keeps its id, so share links and folder membership never move. "New variant" is the same copy with the pointer on the copy instead. Opening a checkpoint as a fresh variant gives branch-from-history for free. When a deck without a family gains its first copy, both rows get a fresh `family_id` and the original becomes primary.

Predecessors stay editable: they are presented as history but nothing locks them. Immutability by construction (option 2) was the main argument for a snapshot table, but it costs a second storage format, a second rendering path, and a read-only viewer, while enforcement on real rows (option 4) needs a guard in every mutation route that touches decks and one missed route silently breaks the guarantee. Convention is enough for a personal tool; an opt-in lock flag remains a bolt-on if it ever isn't. Option 3 is the cleanest concept and the largest refactor, since everything in the app keys on `deck_id`; rejected on cost.

The deck list shows one expandable entry per family, fronted by the primary variant (promotable at any time); the family view lists siblings and the predecessor chain with draft badges and sort/filter. "Show changes" defaults to variant vs predecessor but accepts any two family members; it reuses `diffDecks` and the existing compare dialog. Wants and missing-cards stay exactly per-variant: nothing aggregates wants across decks today, and the feature does not change that. Draft has no behavioral rules beyond badge, sort, and filter. Local anonymous decks (ADR-035) get no variant features; claiming the deck comes first. User-facing name: "variants" (with "previous version" wording for lineage); "family" stays internal.

### Consequences

- Good, because there is one concept and one storage path: the copy engine is Duplicate extended to plans, diffing is the existing compare machinery, and no surface needs a second "version" rendering mode.
- Good, because checkpoint, variant, and branch-from-checkpoint are the same operation differing only in where the predecessor pointer lands.
- Good, because the live deck keeps its identity through a checkpoint, so nothing that references it (share links, folders, tournament deck-check keys) ever dangles.
- Bad, because checkpoints are frozen by convention only; an edit to a predecessor rewrites history with no warning.
- Bad, because family rows multiply real decks: list grouping, folder membership (which follows each variant individually), and deletion of a primary (which must promote a survivor) all need explicit handling.

## More Information

- The split model (option 2) was fully designed first and dropped when the unified model turned out to need no immutable side at all.
- Deferred, deliberately: an opt-in lock flag on variants, draft-state behavior beyond badges (for example blocking sharing), and any automatic snapshots.
- ADR-029 (deck plans) defines the plan tables the variant copy clones; ADR-035 (anonymous deck builder) explains why local decks are excluded.
