---
status: accepted
date: 2026-03-08
---

# ADR-005: Collection Tracking Data Model

## Context and Problem Statement

OpenRift is a card browser with no concept of ownership. Users want to track which cards they own, where they're stored, what they want to trade, and what they still need — and they want a full audit trail of how their collection changed over time.

The data model must support: physical collections (storage locations), individual copy tracking, event-based mutation logging, deck building (card-level), wish lists (manual, dynamic, and deck-derived), and trade lists (manual and dynamic).

## Decision Drivers

- Every physical card is an individual copy of a specific printing
- All mutations to the collection must be traceable (event-based history)
- Deck building operates at the card level, not the printing level
- Wish lists and trade lists come in both manual and rule-generated (dynamic) flavors
- Deck-linked wish lists should never go stale

## Considered Options

- Quantity-based tracking (one row per user+printing with a count)
- Individual copy tracking (one row per physical card)

## Decision Outcome

Chosen option: "Individual copy tracking", because it enables per-copy metadata (condition, notes — planned for later), precise session audit trails, and unambiguous assignment of copies to collections and trade lists.

### Consequences

- Good, because each copy has a stable identity that can be referenced in events, trade lists, and future features (condition, grading, provenance).
- Good, because moving or trading a specific copy is a first-class operation.
- Bad, because bulk operations (e.g., "I opened 36 boosters") create many event rows. Mitigated by batch UI.

## Design Decisions

### Collections

Collections represent physical storage locations (binders, deck boxes, drawers, "lent to Sebastian"). Each copy belongs to exactly one collection.

**Inbox collection:** Every user has exactly one inbox collection, auto-created the first time they interact with collection tracking. The inbox is where cards land during intake (booster openings, quick-adds) before the user sorts them into their real collections. It cannot be deleted. A boolean `is_inbox` flag identifies it, enforced by a partial unique index (`one inbox per user`). The inbox is always `available_for_deckbuilding = true`.

A boolean `available_for_deckbuilding` flag controls whether copies in a collection are considered when building decks. Default true. Collections like "Deck Box 1" (an assembled deck the user doesn't want to cannibalize) can be excluded. _UI note:_ Excluded collections are still visible as "available if needed" in the deck builder.

**Collection deletion:** A collection can only be deleted after all its copies have been moved elsewhere. The inbox collection cannot be deleted. For other collections, the API endpoint requires a `move_copies_to` collection ID — it moves all copies to the target collection (writing `moved` events), then deletes the now-empty collection. The FK on `copies.collection_id` uses `CASCADE` (needed for clean user deletion cascades). A `BEFORE DELETE` trigger on `collections` enforces the "move first" rule at the DB level: it allows the delete only if the collection is empty or the owning user no longer exists (i.e., the delete is part of a user deletion cascade). This is more robust than checking `pg_trigger_depth()`, which would allow any cascade path — not just user deletion — to bypass the guard. This prevents accidental data loss from rogue code paths or direct DB operations while keeping user deletion conflict-free.

### Copies

One row per physical card. References a `printing_id` and a `collection_id`. Hard-deleted when a card leaves the user's possession — the event ledger preserves history. This avoids the pervasive `WHERE deleted_at IS NULL` filtering that soft-delete would require across every query touching copies (joins, counts, collection value, trade list evaluation, deck availability).

When a copy is removed, its `id` survives in the event ledger as `copy_id` until the copy row is hard-deleted, at which point `ON DELETE SET NULL` nulls the reference. `printing_id` on each event is the stable identifier for "what card was this?" historical queries.

### Collection Events (Collection History)

Every mutation to the collection is recorded as a row in `collection_events`. The ledger is intentionally flat: there is no parent "activity" grouping rows together — each event stands on its own. This was a simplification of the original design (an `activities` parent table with an `activity_items` child table grouped under user-meaningful headings) once it became clear the only consumer of the grouping was the activity feed UI, which can derive its own groupings by date and action type at query time.

**Action types** on each event:

- `added` — copy entered possession, `to_collection_id` set
- `removed` — copy left possession, `from_collection_id` set
- `moved` — copy changed collections, both `from_collection_id` and `to_collection_id` set

A CHECK constraint enforces the presence rule (`added` requires `to_collection_id`, `removed` requires `from_collection_id`, `moved` requires both).

**Collection deletion:** Events denormalize collection names (`from_collection_name`, `to_collection_name`) at write time. The collection FKs use `ON DELETE SET NULL`, so deleting a collection nulls the FK but the human-readable name survives in the history. This keeps history readable ("moved from Binder 1 to Deck Box 12") even after Binder 1 is deleted.

### Sources (Deferred)

The original design included a first-class `sources` table for provenance — "Booster Display 2", "Trade with Sebastian", "Singles order from Cardmarket" — linked to copies via a nullable `source_id`. This was dropped from the initial build: per-copy provenance can be reconstructed from `collection_events` (which records when each copy was added and from which collection it came), and a separate provenance entity adds intake-flow complexity without unlocking queries we currently need. Revisit when "show me all cards from Booster Display 2" becomes a real user request.

### Decks

A deck is a list of cards (not printings) with quantities, since deck building is a game-level concern. Each entry belongs to a zone (main or sideboard).

**Formats:**

- `standard` — 40+ main deck cards, optional 8-card sideboard
- `freeform` — no restrictions

Format rules are kept simple for now. User-configurable format definitions (e.g., "allow N cards of type X, require a Legend") are deferred.

**Wanted flag:** Decks have an `is_wanted` boolean (default false). When true, the deck's card requirements feed the shopping list, counting only copies in collections where `available_for_deckbuilding = true`. When false, the deck is just a reference (an idea, a historical tournament deck, or an already-assembled deck whose cards live in a collection). There is no formal link between a deck and a collection — when the user physically assembles a deck, they move the copies into a collection (e.g., "Deck Box 1") with `available_for_deckbuilding = false` and toggle `is_wanted` off.

Every deck has an owner (`user_id NOT NULL`). Curated public decks (e.g., top tournament decks) are owned by whichever user or bot account created them. An `is_public` boolean controls visibility: `is_public = true` → public and discoverable, `share_token IS NOT NULL` → unlisted but accessible via link, otherwise private. A user's personal deck list filters on `user_id = ? AND is_public = false`, so curated decks created by the same user don't clutter their view.

### Wish Lists

Three sources of "what do I need":

1. **Deck requirements (virtual):** Not stored as wish list items. For each card in a wanted deck (`is_wanted = true`), the query counts available copies (in collections where `available_for_deckbuilding = true`) and computes the shortfall. Always accurate, never goes stale. No table needed.

2. **Wish lists:** A wish list can have manual items, dynamic rules, or both.

   **Manual items** are user-curated. Each targets either a specific printing ("I want this exact foil") or a card ("I want 4 copies of Fireball, any printing") with a `quantity_desired`. Items persist when fulfilled — the "still needed" count is computed at query time (`desired - owned`), so trading away a card automatically reflects the gap. When a wish item targets a specific printing, only copies of that exact printing count toward fulfillment.

   **Dynamic rules** _(superseded by [ADR-034](034-dynamic-list-rules.md) — see it for the rule schema and evaluation model)_ are a saved JSONB filter definition evaluated at query time (e.g., "4 copies of every common card", "1 of every foil printing from Spiritforged"). Results change as inventory changes. Rules are stored as JSONB with app-level Zod validation. The exact rule schema will be defined as Zod types in `packages/shared` at implementation time.

   A single list can combine both — e.g., a "Spiritforged" wish list with a dynamic rule for all commons plus manually pinned rares.

_UI note — Shopping list:_ A unified view merges all three sources into a single "still needed" count per card. All demands stack additively — each wanted deck, manual wish list item, and dynamic wish list rule represents an independent need for physical cards. The total demand for a card is the sum across all sources, minus available copies (floored at 0). There is no deduplication between sources: if a wish list asks for 6 Fireballs and two decks each need 4, the user needs 14 total copies. This matches the physical reality — each deck and wish list target requires its own cards.

Example: own 5 available Fireballs, Deck A wants 4, Deck B wants 4, wish list wants 6 → `4 + 4 + 6 - 5 = 9 needed`.

### Trade Lists

A trade list can have manual items, dynamic rules, or both.

**Manual items** are specific copies the user wants to trade/sell. A copy can appear in multiple trade lists but cannot appear in any single list more times than the user owns it. Disposing a copy automatically removes it from all trade lists (the FK on `trade_list_items.copy_id` cascades the delete). _UI note:_ The app prompts confirmation ("This copy is on Trade List X. Dispose it? It will be removed from all trade lists. This can't be undone.").

**Dynamic rules** _(superseded by [ADR-034](034-dynamic-list-rules.md) — see it for the rule schema and evaluation model)_ are a saved JSONB filter definition evaluated at query time (e.g., "all copies beyond the 4th of each card, in Binder 1 or Deck Box 12, worth < 1 EUR on Cardmarket"). Results change as prices and inventory change. Rules are stored as JSONB with app-level Zod validation.

A single list can combine both — e.g., manually pinned copies plus a dynamic rule for surplus commons.

_UI note — Trade binder:_ A unified view merges all trade lists into a deduplicated list of copies available for trade. Each physical card appears once regardless of how many lists include it.

## Schema

The live shape ships in `docs/schema.sql` (regenerate via the `pg_dump` command in `docs/contributing.md`). The most distinctive design choices that landed:

- **Composite FKs (`id, user_id`)** on `collections`, `copies`, `decks`, `wish_lists`, and `trade_lists` — every cross-table reference includes `user_id` so Postgres rejects a copy that points at another user's collection at the schema level, not just at query time.
- **Partial unique index** `uq_collections_user_inbox ON collections(user_id) WHERE is_inbox = true` — enforces "exactly one inbox per user" without needing trigger logic.
- **`BEFORE DELETE` trigger** on `collections` allows the delete only when the collection is empty or the owning user is being deleted (`NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)`). This is preferred over `pg_trigger_depth()` because it whitelists user-deletion cascades specifically rather than any cascade path.
- **Column-list `ON DELETE SET NULL`** (Postgres 15+) on composite FKs that include `user_id NOT NULL` — only the optional column gets nulled when the parent is deleted, keeping `user_id` intact.
- **Denormalized `from_collection_name` / `to_collection_name`** on collection events, so deleting a collection nulls the FK but the human-readable history ("moved from Binder 1 to Deck Box 12") survives.

## Deferred Features

- **Collection groups:** Sharing multiple collections together under a single link
- **User-to-user sharing:** Explicitly granting access to another OpenRift user (vs. current share link model)
- **Copy metadata:** Condition (NM/LP/MP/HP/DMG), notes, provenance on copies. When added, condition becomes a filter option in dynamic trade/wish list rules, and wish list items gain an optional `desired_condition` field so the shopping list only counts copies matching the desired condition as fulfilling a wish.
- **Acquisition cost:** Per-copy purchase price for portfolio vs. cost basis tracking
- **Format rules engine:** User-configurable deck format definitions beyond standard/freeform
- **Event undo:** Reversing the latest event (re-creating deleted copies, restoring moved copies, removing added copies). Needs detailed design around edge cases: deleted collections, copies on trade lists, and transaction semantics.
- **Trade sessions:** Structured trade events linking two users' event ledgers together
