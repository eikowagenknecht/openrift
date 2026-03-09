---
status: proposed
date: 2026-03-08
---

# ADR-005: Collection Tracking Data Model

## Context and Problem Statement

OpenRift is a card browser with no concept of ownership. Users want to track which cards they own, where they're stored, what they want to trade, and what they still need — and they want a full audit trail of how their collection changed over time.

The data model must support: physical collections (storage locations), individual copy tracking, activity-based mutation logging, deck building (card-level), wish lists (manual, dynamic, and deck-derived), and trade lists (manual and dynamic).

## Decision Drivers

- Every physical card is an individual copy of a specific printing
- All mutations to the collection must be traceable (activity-based history)
- Deck building operates at the card level, not the printing level
- Wish lists and trade lists come in both manual and rule-generated (dynamic) flavors
- Deck-linked wish lists should never go stale

## Considered Options

- Quantity-based tracking (one row per user+printing with a count)
- Individual copy tracking (one row per physical card)

## Decision Outcome

Chosen option: "Individual copy tracking", because it enables per-copy metadata (condition, notes — planned for later), precise session audit trails, and unambiguous assignment of copies to collections and trade lists.

### Consequences

- Good, because each copy has a stable identity that can be referenced in activities, trade lists, and future features (condition, grading, provenance).
- Good, because moving or trading a specific copy is a first-class operation.
- Bad, because bulk operations (e.g., "I opened 36 boosters") create many rows and activity items. Mitigated by batch UI and auto-activities.

## Design Decisions

### Collections

Collections represent physical storage locations (binders, deck boxes, drawers, "lent to Sebastian"). Each copy belongs to exactly one collection.

**Inbox collection:** Every user has exactly one inbox collection, auto-created the first time they interact with collection tracking. The inbox is where cards land during intake (booster openings, quick-adds) before the user sorts them into their real collections. It cannot be deleted. A boolean `is_inbox` flag identifies it, enforced by a partial unique index (`one inbox per user`). The inbox is always `available_for_deckbuilding = true`.

A boolean `available_for_deckbuilding` flag controls whether copies in a collection are considered when building decks. Default true. Collections like "Deck Box 1" (an assembled deck the user doesn't want to cannibalize) can be excluded. _UI note:_ Excluded collections are still visible as "available if needed" in the deck builder.

**Collection deletion:** A collection can only be deleted after all its copies have been moved elsewhere. The inbox collection cannot be deleted. For other collections, the API endpoint requires a `move_copies_to` collection ID — it moves all copies to the target collection (creating `reorganization` activity items), then deletes the now-empty collection. The FK on `copies.collection_id` uses `CASCADE` (needed for clean user deletion cascades). A `BEFORE DELETE` trigger on `collections` enforces the "move first" rule at the DB level: it allows the delete only if the collection is empty or the owning user no longer exists (i.e., the delete is part of a user deletion cascade). This is more robust than checking `pg_trigger_depth()`, which would allow any cascade path — not just user deletion — to bypass the guard. This prevents accidental data loss from rogue code paths or direct DB operations while keeping user deletion conflict-free.

### Sources

A source represents where or how cards were acquired — "Booster Display 2", "Trade with Sebastian", "Singles order from Cardmarket". It's a first-class entity: user creates a source, and copies minted during intake are linked to it via a nullable `source_id` FK.

Sources are orthogonal to activities. An activity records _what happened_ (the mutation event), a source records _where it came from_ (provenance). A source can span multiple activities (opening a booster display across several evenings) — the dates a source was used are derived from its linked activities rather than stored on the source itself. An activity can involve multiple sources (unlikely but not forbidden). When creating an acquisition activity, the user can optionally pick or create a source. Copies added without a source simply have `source_id = NULL`.

"Show me all cards from Booster Display 2" is a simple query on `copies.source_id` — no need to traverse activity items.

### Copies

One row per physical card. References a `printing_id`, a `collection_id`, and an optional `source_id`. Hard-deleted when a card leaves the user's possession — the activity ledger preserves history. This avoids the pervasive `WHERE deleted_at IS NULL` filtering that soft-delete would require across every query touching copies (joins, counts, collection value, trade list evaluation, deck availability).

When a copy is removed, relevant metadata is snapshot into the activity item's `metadata_snapshot` JSONB field before deletion. The snapshot includes the copy's UUID (`copy_id`), source, condition, notes, and any other per-copy fields — preserving everything needed for historical queries. The activity item's `copy_id` FK is set to NULL by `ON DELETE SET NULL` when the copy row is hard-deleted.

### Activities (Collection History)

Every mutation to the collection happens through an activity — analogous to a git commit. An activity has a type, name, date, and optional description.

**Activity types:**

- `acquisition` — cards enter possession (booster opening, purchase, trade-in)
- `disposal` — cards leave possession (traded away, sold, gifted)
- `trade` — both directions in one session
- `reorganization` — cards move between collections, net zero

**Auto-activities:** Casual actions (dragging a card between collections, quick-adding a card) don't require the user to fill out a form. Each casual action creates its own auto-activity (`is_auto = true`, `name = NULL`) with a single activity item. _UI note:_ The activity history groups auto-activities by date and type for display (e.g., "2 cards added · 3 cards reorganized"), so the history stays clean despite the one-activity-per-action granularity.

**Activity items** record individual copy mutations:

- `added` — copy entered possession, `to_collection_id` set
- `removed` — copy left possession, `from_collection_id` set, metadata snapshot saved
- `moved` — copy changed collections, both `from_collection_id` and `to_collection_id` set

**Type–action consistency:** Each activity item denormalizes its parent's `activity_type`. A composite FK ensures the value matches the parent activity. A CHECK constraint then restricts which actions are valid per type: `acquisition` → `added` only, `disposal` → `removed` only, `trade` → `added` or `removed`, `reorganization` → `moved` only. This gives a hard DB-level guarantee that the audit ledger is internally consistent, and also lets queries on `activity_items` filter by activity type without joining back to `activities`.

**Collection deletion:** Activity items denormalize collection names (`from_collection_name`, `to_collection_name`) at creation time. The collection FKs use `ON DELETE SET NULL`, so deleting a collection nulls the FK but the human-readable name survives in the history. This keeps history readable ("moved from Binder 1 to Deck Box 12") even after Binder 1 is deleted.

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

   **Dynamic rules** are a saved JSONB filter definition evaluated at query time (e.g., "4 copies of every common card", "1 of every foil printing from Spiritforged"). Results change as inventory changes. Rules are stored as JSONB with app-level Zod validation. The exact rule schema will be defined as Zod types in `packages/shared` at implementation time.

   A single list can combine both — e.g., a "Spiritforged" wish list with a dynamic rule for all commons plus manually pinned rares.

_UI note — Shopping list:_ A unified view merges all three sources into a single "still needed" count per card. All demands stack additively — each wanted deck, manual wish list item, and dynamic wish list rule represents an independent need for physical cards. The total demand for a card is the sum across all sources, minus available copies (floored at 0). There is no deduplication between sources: if a wish list asks for 6 Fireballs and two decks each need 4, the user needs 14 total copies. This matches the physical reality — each deck and wish list target requires its own cards.

Example: own 5 available Fireballs, Deck A wants 4, Deck B wants 4, wish list wants 6 → `4 + 4 + 6 - 5 = 9 needed`.

### Trade Lists

A trade list can have manual items, dynamic rules, or both.

**Manual items** are specific copies the user wants to trade/sell. A copy can appear in multiple trade lists but cannot appear in any single list more times than the user owns it. Disposing a copy automatically removes it from all trade lists (the FK on `trade_list_items.copy_id` cascades the delete). _UI note:_ The app prompts confirmation ("This copy is on Trade List X. Dispose it? It will be removed from all trade lists. This can't be undone.").

**Dynamic rules** are a saved JSONB filter definition evaluated at query time (e.g., "all copies beyond the 4th of each card, in Binder 1 or Deck Box 12, worth < 1 EUR on Cardmarket"). Results change as prices and inventory change. Rules are stored as JSONB with app-level Zod validation.

A single list can combine both — e.g., manually pinned copies plus a dynamic rule for surplus commons.

_UI note — Trade binder:_ A unified view merges all trade lists into a deduplicated list of copies available for trade. Each physical card appears once regardless of how many lists include it.

## Schema

```sql
-- ── Collections ───────────────────────────────────────────────────
CREATE TABLE collections (
  id                        uuid PRIMARY KEY,
  user_id                   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  description               text,
  available_for_deckbuilding boolean NOT NULL DEFAULT true,
  is_inbox                  boolean NOT NULL DEFAULT false,
  sort_order                integer NOT NULL DEFAULT 0,
  share_token               text UNIQUE,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
-- List all collections for a user (the main collections page)
CREATE INDEX idx_collections_user_id ON collections(user_id);
-- Enforces exactly one inbox per user (partial unique index — only rows
-- with is_inbox = true participate, so non-inbox rows are unconstrained)
CREATE UNIQUE INDEX uq_collections_user_inbox
  ON collections(user_id) WHERE is_inbox = true;
-- Redundant as a uniqueness guarantee (id is already the PK), but
-- required so that copies can FK on (id, user_id) together — which
-- lets Postgres enforce that a copy's collection belongs to the same user.
ALTER TABLE collections ADD CONSTRAINT uq_collections_id_user
  UNIQUE (id, user_id);

-- Prevents deleting a non-empty collection unless the owning user is
-- being deleted (in which case the cascade should proceed unimpeded).
CREATE FUNCTION prevent_nonempty_collection_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if the owning user no longer exists (user deletion cascade).
  -- This is safer than pg_trigger_depth() which would allow any cascade
  -- path to bypass the guard, not just user deletion.
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  -- Block if the collection still has copies
  IF EXISTS (SELECT 1 FROM copies WHERE collection_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION
      'Cannot delete collection % — it still has copies. Move them first.',
      OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_nonempty_collection_delete
  BEFORE DELETE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION prevent_nonempty_collection_delete();

-- ── Sources ──────────────────────────────────────────────────────
CREATE TABLE sources (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- List all sources for a user (source picker in the intake flow)
CREATE INDEX idx_sources_user_id ON sources(user_id);
-- Same pattern as collections: required so that copies can FK on
-- (id, user_id) together — prevents cross-user source references.
ALTER TABLE sources ADD CONSTRAINT uq_sources_id_user
  UNIQUE (id, user_id);

-- ── Copies ────────────────────────────────────────────────────────
CREATE TABLE copies (
  id            uuid PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  printing_id   text NOT NULL REFERENCES printings(id),
  collection_id uuid NOT NULL,
  -- Composite FK: Postgres checks that (collection_id, user_id) matches a
  -- row in collections, so a copy can never reference another user's collection.
  -- CASCADE: deleting a collection deletes its copies (the app enforces
  -- "move copies first" via the move_copies_to API parameter; this is
  -- the fallback for user deletion cascades).
  CONSTRAINT fk_copies_collection_user
    FOREIGN KEY (collection_id, user_id) REFERENCES collections(id, user_id)
    ON DELETE CASCADE,
  source_id     uuid,
  -- Composite FK: same pattern as collection — prevents cross-user
  -- source references. Column-list SET NULL (Postgres 15+) nulls only
  -- source_id when a source is deleted — user_id (NOT NULL) stays intact.
  CONSTRAINT fk_copies_source_user
    FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id)
    ON DELETE SET NULL (source_id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- "How many of this printing do I own?" — used by wish list fulfillment,
-- shopping list, and the card detail overlay
CREATE INDEX idx_copies_user_printing ON copies(user_id, printing_id);
-- "Show all copies in this collection" — the collection detail page
CREATE INDEX idx_copies_collection ON copies(collection_id);
-- "Show all copies from this source" — provenance queries
CREATE INDEX idx_copies_source ON copies(source_id);
-- Required so that activity_items can FK on (id, user_id) together —
-- prevents an activity item from referencing another user's copy.
ALTER TABLE copies ADD CONSTRAINT uq_copies_id_user
  UNIQUE (id, user_id);

-- ── Activities ────────────────────────────────────────────────────
CREATE TABLE activities (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  name        text,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  is_auto     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_activities_type
    CHECK (type IN ('acquisition', 'disposal', 'trade', 'reorganization'))
);
-- List a user's activity history (activity feed page)
CREATE INDEX idx_activities_user_id ON activities(user_id);
-- Required so that activity_items can FK on (id, user_id, type) together —
-- prevents an activity item from referencing another user's activity and
-- ensures the denormalized activity_type matches the parent.
ALTER TABLE activities ADD CONSTRAINT uq_activities_id_user_type
  UNIQUE (id, user_id, type);

-- ── Activity Items ────────────────────────────────────────────────
CREATE TABLE activity_items (
  id                   uuid PRIMARY KEY,
  activity_id          uuid NOT NULL,
  user_id              text NOT NULL,
  activity_type        text NOT NULL,
  -- Composite FK: ensures the activity belongs to the same user and
  -- the denormalized activity_type matches the parent. CASCADE:
  -- deleting an activity deletes its items. Activities are never
  -- deleted in normal operation (they are the audit ledger); CASCADE
  -- only fires during user deletion cascades.
  CONSTRAINT fk_activity_items_activity_user
    FOREIGN KEY (activity_id, user_id, activity_type)
    REFERENCES activities(id, user_id, type)
    ON DELETE CASCADE,
  -- SET NULL fires on ALL items referencing a deleted copy, not just the
  -- 'removed' one. A NULL copy_id on an 'added' or 'moved' item simply
  -- means the copy was later disposed. printing_id (always non-null) is
  -- the stable identifier for history; metadata_snapshot is only written
  -- on the 'removed' item where it's needed for historical queries.
  -- Composite FK: ensures the copy belongs to the same user. When copy_id
  -- is NULL (copy was disposed), the FK is not evaluated.
  copy_id              uuid,
  -- Column-list SET NULL (Postgres 15+): only copy_id is nulled when a
  -- copy is deleted — user_id (NOT NULL) stays intact.
  CONSTRAINT fk_activity_items_copy_user
    FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
    ON DELETE SET NULL (copy_id),
  printing_id          text NOT NULL REFERENCES printings(id),
  action               text NOT NULL,
  -- Composite FKs: ensures collection refs belong to the same user.
  -- Column-list SET NULL: only the collection ID is nulled when a
  -- collection is deleted — user_id stays intact.
  from_collection_id   uuid,
  CONSTRAINT fk_activity_items_from_collection_user
    FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
    ON DELETE SET NULL (from_collection_id),
  from_collection_name text,
  to_collection_id     uuid,
  CONSTRAINT fk_activity_items_to_collection_user
    FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
    ON DELETE SET NULL (to_collection_id),
  to_collection_name   text,
  metadata_snapshot    jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_activity_items_action
    CHECK (action IN ('added', 'removed', 'moved')),
  CONSTRAINT chk_activity_items_type_action
    CHECK (
      (activity_type = 'acquisition'    AND action = 'added')   OR
      (activity_type = 'disposal'       AND action = 'removed') OR
      (activity_type = 'trade'          AND action IN ('added', 'removed')) OR
      (activity_type = 'reorganization' AND action = 'moved')
    )
);
-- Load all items for an activity (activity detail view)
CREATE INDEX idx_activity_items_activity ON activity_items(activity_id);
-- "Show history for this copy" — per-copy audit trail
CREATE INDEX idx_activity_items_copy ON activity_items(copy_id);

-- ── Decks ─────────────────────────────────────────────────────────
CREATE TABLE decks (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  format      text NOT NULL,
  is_wanted   boolean NOT NULL DEFAULT false,
  is_public   boolean NOT NULL DEFAULT false,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_decks_format CHECK (format IN ('standard', 'freeform'))
);
-- List a user's decks (deck list page, wanted-deck queries for shopping list)
CREATE INDEX idx_decks_user_id ON decks(user_id);

-- ── Deck Cards ────────────────────────────────────────────────────
CREATE TABLE deck_cards (
  id       uuid PRIMARY KEY,
  deck_id  uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id  text NOT NULL REFERENCES cards(id),
  zone     text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_deck_cards_quantity CHECK (quantity > 0),
  CONSTRAINT chk_deck_cards_zone CHECK (zone IN ('main', 'sideboard')),
  CONSTRAINT uq_deck_cards UNIQUE (deck_id, card_id, zone)
);
-- Load all cards in a deck (deck detail view, shopping list calculation)
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);

-- ── Wish Lists ────────────────────────────────────────────────────
CREATE TABLE wish_lists (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  rules       jsonb,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- List a user's wish lists (wish list page, shopping list aggregation)
CREATE INDEX idx_wish_lists_user_id ON wish_lists(user_id);
-- Required so that wish_list_items can FK on (id, user_id) together —
-- prevents an item from referencing another user's wish list.
ALTER TABLE wish_lists ADD CONSTRAINT uq_wish_lists_id_user
  UNIQUE (id, user_id);

-- ── Wish List Items ──────────────────────────────────────────────
-- Each unique constraint only fires for its non-NULL column (Postgres
-- ignores NULLs in unique indexes), so together with the CHECK they
-- prevent duplicate card-targeted or printing-targeted items per list.
CREATE TABLE wish_list_items (
  id               uuid PRIMARY KEY,
  wish_list_id     uuid NOT NULL,
  user_id          text NOT NULL,
  -- Composite FK: ensures the wish list belongs to the same user.
  CONSTRAINT fk_wish_list_items_list_user
    FOREIGN KEY (wish_list_id, user_id) REFERENCES wish_lists(id, user_id)
    ON DELETE CASCADE,
  card_id          text REFERENCES cards(id),
  printing_id      text REFERENCES printings(id),
  quantity_desired integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_wish_list_items_quantity CHECK (quantity_desired > 0),
  CONSTRAINT chk_wish_list_items_target
    CHECK (
      (card_id IS NOT NULL AND printing_id IS NULL) OR
      (card_id IS NULL AND printing_id IS NOT NULL)
    ),
  CONSTRAINT uq_wish_list_items_card UNIQUE (wish_list_id, card_id),
  CONSTRAINT uq_wish_list_items_printing UNIQUE (wish_list_id, printing_id)
);
-- Load all items in a wish list (wish list detail, shopping list calculation)
CREATE INDEX idx_wish_list_items_list ON wish_list_items(wish_list_id);

-- ── Trade Lists ───────────────────────────────────────────────────
CREATE TABLE trade_lists (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  rules       jsonb,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- List a user's trade lists (trade list page, trade binder aggregation)
CREATE INDEX idx_trade_lists_user_id ON trade_lists(user_id);
-- Required so that trade_list_items can FK on (id, user_id) together —
-- prevents an item from referencing another user's trade list.
ALTER TABLE trade_lists ADD CONSTRAINT uq_trade_lists_id_user
  UNIQUE (id, user_id);

-- ── Trade List Items ─────────────────────────────────────────────
CREATE TABLE trade_list_items (
  id            uuid PRIMARY KEY,
  trade_list_id uuid NOT NULL,
  user_id       text NOT NULL,
  -- Composite FK: ensures the trade list belongs to the same user.
  CONSTRAINT fk_trade_list_items_list_user
    FOREIGN KEY (trade_list_id, user_id) REFERENCES trade_lists(id, user_id)
    ON DELETE CASCADE,
  -- Composite FK: ensures the copy belongs to the same user —
  -- prevents adding another user's copy to your trade list.
  -- CASCADE: disposing a copy automatically removes it from all trade lists.
  copy_id       uuid NOT NULL,
  CONSTRAINT fk_trade_list_items_copy_user
    FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT uq_trade_list_items UNIQUE (trade_list_id, copy_id)
);
-- Load all copies on a trade list (trade list detail, trade binder dedup)
CREATE INDEX idx_trade_list_items_list ON trade_list_items(trade_list_id);
-- "Which trade lists is this copy on?" — disposal confirmation, FK cascade
CREATE INDEX idx_trade_list_items_copy ON trade_list_items(copy_id);
```

## Deferred Features

- **Collection groups:** Sharing multiple collections together under a single link
- **User-to-user sharing:** Explicitly granting access to another OpenRift user (vs. current share link model)
- **Copy metadata:** Condition (NM/LP/MP/HP/DMG), notes, provenance on copies. When added, condition becomes a filter option in dynamic trade/wish list rules, and wish list items gain an optional `desired_condition` field so the shopping list only counts copies matching the desired condition as fulfilling a wish.
- **Acquisition cost:** Per-copy purchase price for portfolio vs. cost basis tracking
- **Format rules engine:** User-configurable deck format definitions beyond standard/freeform
- **Activity undo:** Reversing the latest activity (re-creating deleted copies, restoring moved copies, removing added copies). Needs detailed design around edge cases: deleted collections, copies on trade lists, restoring source references, and transaction semantics.
- **Trade activities:** Structured trade events linking two users' activities together
