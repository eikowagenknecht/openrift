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

A boolean `available_for_deckbuilding` flag controls whether copies in a collection are considered when building decks. Default true. Collections like "Deck Box 1" (an assembled deck the user doesn't want to cannibalize) can be excluded while still being visible as "available if needed" in the UI.

**Collection deletion:** A collection can only be deleted after all its copies have been moved elsewhere. The inbox collection cannot be deleted. For other collections, the API endpoint requires a `move_copies_to` collection ID — it moves all copies to the target collection (creating `reorganization` activity items), then deletes the now-empty collection. The bare FK on `copies.collection_id` (default `RESTRICT`) acts as a safety net: Postgres blocks the delete if any copies still reference it.

### Sources

A source represents where or how cards were acquired — "Booster Display 2", "Trade with Sebastian", "Singles order from Cardmarket". It's a first-class entity: user creates a source, and copies minted during intake are linked to it via a nullable `source_id` FK.

Sources are orthogonal to activities. An activity records _what happened_ (the mutation event), a source records _where it came from_ (provenance). A source can span multiple activities (opening a booster display across several evenings), and an activity can involve multiple sources (unlikely but not forbidden). When creating an acquisition activity, the user can optionally pick or create a source. Copies added without a source simply have `source_id = NULL`.

"Show me all cards from Booster Display 2" is a simple query on `copies.source_id` — no need to traverse activity items.

### Copies

One row per physical card. References a `printing_id`, a `collection_id`, and an optional `source_id`. Hard-deleted when a card leaves the user's possession — the activity ledger preserves history. This avoids the pervasive `WHERE deleted_at IS NULL` filtering that soft-delete would require across every query touching copies (joins, counts, collection value, trade list evaluation, deck availability).

When a copy is removed, relevant metadata is snapshot into the activity item's `metadata_snapshot` JSONB field before deletion. The snapshot includes the copy's UUID (`copy_id`), source, condition, notes, and any other per-copy fields — preserving everything needed for historical queries and undo. The activity item's `copy_id` FK is set to NULL by `ON DELETE SET NULL` when the copy row is hard-deleted, so undo reads the original UUID from `metadata_snapshot` to re-insert the copy with its original identity.

### Activities (Collection History)

Every mutation to the collection happens through an activity — analogous to a git commit. An activity has a type, name, date, and optional description.

**Activity types:**

- `acquisition` — cards enter possession (booster opening, purchase, trade-in)
- `disposal` — cards leave possession (traded away, sold, gifted)
- `trade` — both directions in one session
- `reorganization` — cards move between collections, net zero

**Auto-activities:** Casual actions (dragging a card between collections, quick-adding a card) don't require the user to fill out a form. The system silently creates or appends to a daily auto-activity ("Changes on 2026-03-08"). Users can rename or describe it later.

**Activity items** record individual copy mutations:

- `added` — copy entered possession, `to_collection_id` set
- `removed` — copy left possession, `from_collection_id` set, metadata snapshot saved
- `moved` — copy changed collections, both `from_collection_id` and `to_collection_id` set

**Collection deletion:** Activity items denormalize collection names (`from_collection_name`, `to_collection_name`) at creation time. The collection FKs use `ON DELETE SET NULL`, so deleting a collection nulls the FK but the human-readable name survives in the history. This keeps history readable ("moved from Binder 1 to Deck Box 12") even after Binder 1 is deleted.

**Undo:** Only the latest activity can be undone (like `git reset`, not `git revert`). Undoing hard-deletes the activity and all its activity items, and reverses all associated actions: re-creates any hard-deleted copies using the original UUID and `printing_id` from `metadata_snapshot` and the `to_collection_id` from the activity item, restores moved copies to their previous collections (using `from_collection_id`), and removes any copies that were added. The collection returns to exactly the state it was in before the activity. Note: undo restores copies but does not restore trade list memberships that were removed before disposal — that removal was an explicit user action.

### Decks

A deck is a list of cards (not printings) with quantities, since deck building is a game-level concern. Each entry belongs to a zone (main or sideboard).

**Formats:**

- `standard` — 40+ main deck cards, optional 8-card sideboard
- `freeform` — no restrictions

Format rules are kept simple for now. User-configurable format definitions (e.g., "allow N cards of type X, require a Legend") are deferred.

**Wanted flag:** Decks have an `is_wanted` boolean (default false). When true, the deck's card requirements feed the shopping list, counting only copies in collections where `available_for_deckbuilding = true`. When false, the deck is just a reference (an idea, a historical tournament deck, or an already-assembled deck whose cards live in a collection). There is no formal link between a deck and a collection — when the user physically assembles a deck, they move the copies into a collection (e.g., "Deck Box 1") with `available_for_deckbuilding = false` and toggle `is_wanted` off.

Decks belong to a user, but `user_id` is nullable to support curated public decks (e.g., top tournament decks) that don't belong to any user. Visibility is derived: `user_id IS NULL` = public and discoverable, `share_token IS NOT NULL` = unlisted but accessible via link, otherwise private.

### Wish Lists

Three sources of "what do I need":

1. **Deck requirements (virtual):** Not stored as wish list items. For each card in a wanted deck (`is_wanted = true`), the query counts available copies (in collections where `available_for_deckbuilding = true`) and computes the shortfall. Always accurate, never goes stale. No table needed.

2. **Manual wish lists:** User-curated stored items. Can target a specific printing ("I want this exact foil") or a card ("I want 4 copies of Fireball, any printing"). Each item has a `quantity_desired`. Items persist when fulfilled — the "still needed" count is computed at query time (`desired - owned`), so if the user later trades away a card, the wish list automatically reflects the gap.

3. **Dynamic wish lists:** A saved JSONB filter definition evaluated at query time (e.g., "4 copies of every common card" or "1 of every foil printing from Spiritforged"). Results change as inventory changes. Rules are stored as JSONB with app-level validation via Zod. Postgres JSONB supports indexing and querying, and Kysely handles JSONB columns natively.

A unified "shopping list" UI view merges all three sources. All desired quantities are summed independently across all sources (wanted decks, manual wish lists, dynamic wish lists), then available copies are subtracted once. For example: own 5 available Fireballs, Deck A wants 4, Deck B wants 4, manual wish list wants 6 → `4 + 4 + 6 - 5 = 9 needed`.

### Trade Lists

Two flavors:

1. **Manual trade lists:** User curates a list of specific copies to trade/sell. A copy can appear in multiple trade lists but cannot appear in any single list more times than the user owns it. Disposing a copy that appears on trade lists is not automatic — the UI prompts the user to confirm removal from all affected trade lists first ("This copy is on Trade List X. Remove it and dispose? This can't be undone."). The FK on `trade_list_items.copy_id` uses default `RESTRICT`, so Postgres blocks disposal if the app layer somehow skips the check.

2. **Dynamic trade lists:** A saved JSONB filter definition evaluated at query time (e.g., "all copies beyond the 4th of each card, in Binder 1 or Deck Box 12, worth < 1 EUR on Cardmarket"). Results change as prices and inventory change.

Dynamic trade list rules are also stored as JSONB with app-level Zod validation. Postgres JSONB supports indexing and querying, and Kysely handles JSONB columns natively.

A unified "trade binder" UI view merges all trade lists into a deduplicated list of copies available for trade. Since a copy can appear in multiple trade lists, the view deduplicates by copy — each physical card appears once regardless of how many lists include it.

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
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE UNIQUE INDEX uq_collections_user_inbox
  ON collections(user_id) WHERE is_inbox = true;

-- ── Sources ──────────────────────────────────────────────────────
CREATE TABLE sources (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  date        date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_user_id ON sources(user_id);

-- ── Copies ────────────────────────────────────────────────────────
CREATE TABLE copies (
  id            uuid PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  printing_id   text NOT NULL REFERENCES printings(id),
  collection_id uuid NOT NULL REFERENCES collections(id),
  source_id     uuid REFERENCES sources(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_copies_user_printing ON copies(user_id, printing_id);
CREATE INDEX idx_copies_collection ON copies(collection_id);
CREATE INDEX idx_copies_source ON copies(source_id);

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
CREATE INDEX idx_activities_user_id ON activities(user_id);

-- ── Activity Items ────────────────────────────────────────────────
CREATE TABLE activity_items (
  id                   uuid PRIMARY KEY,
  activity_id          uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  copy_id              uuid REFERENCES copies(id) ON DELETE SET NULL,
  printing_id          text NOT NULL REFERENCES printings(id),
  action               text NOT NULL,
  from_collection_id   uuid REFERENCES collections(id) ON DELETE SET NULL,
  from_collection_name text,
  to_collection_id     uuid REFERENCES collections(id) ON DELETE SET NULL,
  to_collection_name   text,
  metadata_snapshot    jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_activity_items_action
    CHECK (action IN ('added', 'removed', 'moved'))
);
CREATE INDEX idx_activity_items_activity ON activity_items(activity_id);

-- ── Decks ─────────────────────────────────────────────────────────
CREATE TABLE decks (
  id         uuid PRIMARY KEY,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  format      text NOT NULL,
  is_wanted   boolean NOT NULL DEFAULT false,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_decks_format CHECK (format IN ('standard', 'freeform'))
);
CREATE INDEX idx_decks_user_id ON decks(user_id);

-- ── Deck Cards ────────────────────────────────────────────────────
CREATE TABLE deck_cards (
  id       uuid PRIMARY KEY,
  deck_id  uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id  text NOT NULL REFERENCES cards(id),
  zone     text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_deck_cards_zone CHECK (zone IN ('main', 'sideboard')),
  CONSTRAINT uq_deck_cards UNIQUE (deck_id, card_id, zone)
);
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);

-- ── Wish Lists ────────────────────────────────────────────────────
CREATE TABLE wish_lists (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_dynamic  boolean NOT NULL DEFAULT false,
  rules       jsonb,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wish_lists_user_id ON wish_lists(user_id);

-- ── Wish List Items (static only) ────────────────────────────────
CREATE TABLE wish_list_items (
  id               uuid PRIMARY KEY,
  wish_list_id     uuid NOT NULL REFERENCES wish_lists(id) ON DELETE CASCADE,
  card_id          text REFERENCES cards(id),
  printing_id      text REFERENCES printings(id),
  quantity_desired integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_wish_list_items_target
    CHECK (
      (card_id IS NOT NULL AND printing_id IS NULL) OR
      (card_id IS NULL AND printing_id IS NOT NULL)
    )
);
CREATE INDEX idx_wish_list_items_list ON wish_list_items(wish_list_id);

-- ── Trade Lists ───────────────────────────────────────────────────
CREATE TABLE trade_lists (
  id         uuid PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_dynamic  boolean NOT NULL DEFAULT false,
  rules       jsonb,
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trade_lists_user_id ON trade_lists(user_id);

-- ── Trade List Items (static only) ────────────────────────────────
CREATE TABLE trade_list_items (
  id            uuid PRIMARY KEY,
  trade_list_id uuid NOT NULL REFERENCES trade_lists(id) ON DELETE CASCADE,
  copy_id       uuid NOT NULL REFERENCES copies(id),
  CONSTRAINT uq_trade_list_items UNIQUE (trade_list_id, copy_id)
);
CREATE INDEX idx_trade_list_items_list ON trade_list_items(trade_list_id);
```

## Deferred Features

- **Collection groups:** Sharing multiple collections together under a single link
- **User-to-user sharing:** Explicitly granting access to another OpenRift user (vs. current share link model)
- **Copy metadata:** Condition (NM/LP/MP/HP/DMG), notes, provenance on copies. When added, condition becomes a filter option in dynamic trade/wish list rules, and wish list items gain an optional `desired_condition` field so the shopping list only counts copies matching the desired condition as fulfilling a wish.
- **Acquisition cost:** Per-copy purchase price for portfolio vs. cost basis tracking
- **Format rules engine:** User-configurable deck format definitions beyond standard/freeform
- **Trade activities:** Structured trade events linking two users' activities together
