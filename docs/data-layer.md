# Data Layer

PostgreSQL database managed by Kysely migrations in `packages/shared/src/db/migrations/`.

## Naming Conventions

| Element         | Convention                         | Example                      |
| --------------- | ---------------------------------- | ---------------------------- |
| Tables          | `snake_case`, plural               | `cards`, `deck_cards`        |
| Columns         | `snake_case`                       | `collector_number`, `set_id` |
| Primary keys    | `id` column, uuid (uuidv7)         | `id uuid default uuidv7()`   |
| Foreign keys    | `{referenced_table_singular}_id`   | `card_id`, `user_id`         |
| Indexes         | `idx_{table}_{columns}`            | `idx_printings_set_id`       |
| Timestamps      | `timestamptz`, `_at` suffix        | `created_at`, `expires_at`   |
| Monetary values | integer cents, `_cents` suffix     | `market_cents`, `low_cents`  |
| Boolean columns | Descriptive prefix (`is_`, `has_`) | `is_signed`                  |
| Slugs           | URL-safe identifier, unique        | `slug text not null unique`  |

**Rationale:** PostgreSQL folds unquoted identifiers to lowercase, so `snake_case` avoids the need for quoting. Plural table names are used consistently throughout — including join tables (e.g. `deck_cards`). All core tables use `uuidv7()` primary keys for sortable, globally unique IDs. Auth tables (managed by better-auth) still use text IDs.

## Core Tables

### `sets`

Set metadata. Each set has a UUID primary key and a human-readable `slug` (e.g. "origins", "ognition") used in URLs.

| Column          | Type        | Constraints                                                 |
| --------------- | ----------- | ----------------------------------------------------------- |
| `id`            | uuid        | primary key, default uuidv7()                               |
| `name`          | text        | not null                                                    |
| `slug`          | text        | not null, unique                                            |
| `printed_total` | integer     | nullable — the official denominator (e.g. 298 in "001/298") |
| `sort_order`    | integer     | not null, default 0                                         |
| `released_at`   | date        | nullable                                                    |
| `created_at`    | timestamptz | not null, default now()                                     |
| `updated_at`    | timestamptz | not null, default now()                                     |

### `cards`

Game card identity — one row per unique card. Stats and rules live here; physical product details (art, rarity, finish) live in `printings`.

| Column        | Type        | Constraints                                                |
| ------------- | ----------- | ---------------------------------------------------------- |
| `id`          | uuid        | primary key, default uuidv7()                              |
| `name`        | text        | not null                                                   |
| `slug`        | text        | not null, unique                                           |
| `norm_name`   | text        | not null — auto-set by trigger (lowercase, alphanumeric)   |
| `type`        | text        | not null (Legend, Unit, Rune, Spell, Gear, Battlefield)    |
| `super_types` | text[]      | not null, default '{}' (Basic, Champion, Signature, Token) |
| `domains`     | text[]      | not null (Fury, Calm, Mind, Body, Chaos, Order, Colorless) |
| `might`       | integer     | nullable — Unit only                                       |
| `energy`      | integer     | nullable — Unit, Spell, Gear only                          |
| `power`       | integer     | nullable — Unit, Spell, Gear only                          |
| `might_bonus` | integer     | nullable — Gear only                                       |
| `keywords`    | text[]      | not null, default '{}'                                     |
| `rules_text`  | text        | nullable                                                   |
| `effect_text` | text        | nullable                                                   |
| `tags`        | text[]      | not null, default '{}'                                     |
| `created_at`  | timestamptz | not null, default now()                                    |
| `updated_at`  | timestamptz | not null, default now()                                    |

Stats are nullable with type-specific semantics: `might` is only set for Units, `might_bonus` only for Gear, and `energy`/`power` only for Unit, Spell, and Gear. CHECK constraints enforce valid domain and type values, non-negative stats, and non-empty text fields (nulls are allowed, empty strings are not).

### `printings`

Physical product variations of a game card (art, rarity, finish, etc.). One card can have many printings across sets and variants.

| Column                | Type        | Constraints                                       |
| --------------------- | ----------- | ------------------------------------------------- |
| `id`                  | uuid        | primary key, default uuidv7()                     |
| `card_id`             | uuid        | not null, FK → cards.id                           |
| `set_id`              | uuid        | not null, FK → sets.id                            |
| `slug`                | text        | not null, unique                                  |
| `short_code`          | text        | not null                                          |
| `collector_number`    | integer     | not null (> 0)                                    |
| `rarity`              | text        | not null (Common, Uncommon, Rare, Epic, Showcase) |
| `art_variant`         | text        | not null (normal, altart, overnumbered)           |
| `is_signed`           | boolean     | not null, default false                           |
| `finish`              | text        | not null (normal, foil)                           |
| `artist`              | text        | not null                                          |
| `public_code`         | text        | not null                                          |
| `printed_rules_text`  | text        | nullable (may differ from card's canonical text)  |
| `printed_effect_text` | text        | nullable                                          |
| `flavor_text`         | text        | nullable                                          |
| `comment`             | text        | nullable — admin notes                            |
| `promo_type_id`       | uuid        | nullable, FK → promo_types.id                     |
| `created_at`          | timestamptz | not null, default now()                           |
| `updated_at`          | timestamptz | not null, default now()                           |

Indexes: `card_id`, `set_id`, `rarity`. Unique constraint on `(short_code, art_variant, is_signed, promo_type_id, rarity, finish)`.

All FKs use `NO ACTION` on delete — deleting a card or set is blocked while printings reference it. This is intentional: printings are the primary unit of ownership (collections, wishlists) so they must never be silently removed.

### `printing_images`

Image data for printings, supporting multiple providers (e.g. gallery, rehosted CDN) and faces (front, back).

| Column         | Type        | Constraints                             |
| -------------- | ----------- | --------------------------------------- |
| `id`           | uuid        | primary key, default uuidv7()           |
| `printing_id`  | uuid        | not null, FK → printings.id             |
| `face`         | text        | not null, default 'front' (front, back) |
| `provider`     | text        | not null                                |
| `original_url` | text        | nullable                                |
| `rehosted_url` | text        | nullable                                |
| `is_active`    | boolean     | not null, default false                 |
| `created_at`   | timestamptz | not null, default now()                 |
| `updated_at`   | timestamptz | not null, default now()                 |

CHECK constraint ensures at least one of `original_url` or `rehosted_url` is set. Unique partial index ensures at most one active image per `(printing_id, face)`. Unique index on `(printing_id, face, provider)`.

### `promo_types`

Lookup table for promo variant classification (e.g. "prerelease", "promo-pack").

| Column       | Type        | Constraints                   |
| ------------ | ----------- | ----------------------------- |
| `id`         | uuid        | primary key, default uuidv7() |
| `slug`       | text        | not null, unique              |
| `label`      | text        | not null                      |
| `sort_order` | integer     | not null, default 0           |
| `created_at` | timestamptz | not null, default now()       |
| `updated_at` | timestamptz | not null, default now()       |

### `card_name_aliases`

Maps alternative card names to a canonical card. Used for marketplace name matching when a card's marketplace name differs from its canonical name.

| Column      | Type | Constraints                                 |
| ----------- | ---- | ------------------------------------------- |
| `card_id`   | uuid | not null, FK → cards.id (on delete cascade) |
| `norm_name` | text | primary key                                 |

## Collection Tables

### `collections`

Named groups of owned card copies. Each user has one auto-created "inbox" collection.

| Column                       | Type        | Constraints                                 |
| ---------------------------- | ----------- | ------------------------------------------- |
| `id`                         | uuid        | primary key, default uuidv7()               |
| `user_id`                    | text        | not null, FK → users.id (on delete cascade) |
| `name`                       | text        | not null                                    |
| `description`                | text        | nullable                                    |
| `available_for_deckbuilding` | boolean     | not null, default true                      |
| `is_inbox`                   | boolean     | not null, default false                     |
| `sort_order`                 | integer     | not null, default 0                         |
| `share_token`                | text        | nullable, unique                            |
| `created_at`                 | timestamptz | not null, default now()                     |
| `updated_at`                 | timestamptz | not null, default now()                     |

Unique partial index ensures at most one inbox per user. A trigger prevents deleting a collection that still has copies (unless the owning user is being deleted).

### `copies`

Individual physical copies of printings owned by a user. Each copy lives in exactly one collection.

| Column          | Type        | Constraints                                                 |
| --------------- | ----------- | ----------------------------------------------------------- |
| `id`            | uuid        | primary key, default uuidv7()                               |
| `user_id`       | text        | not null, FK → users.id (on delete cascade)                 |
| `collection_id` | uuid        | not null, FK → collections(id, user_id) (on delete cascade) |
| `printing_id`   | uuid        | not null, FK → printings.id                                 |
| `created_at`    | timestamptz | not null, default now()                                     |
| `updated_at`    | timestamptz | not null, default now()                                     |

Indexes: `collection_id`, `(user_id, printing_id)`.

## Deck Tables

### `decks`

User-built card decks. The `is_wanted` flag marks "want to build" decks for shopping list integration.

| Column        | Type        | Constraints                                 |
| ------------- | ----------- | ------------------------------------------- |
| `id`          | uuid        | primary key, default uuidv7()               |
| `user_id`     | text        | not null, FK → users.id (on delete cascade) |
| `name`        | text        | not null                                    |
| `description` | text        | nullable                                    |
| `format`      | text        | not null (standard, freeform)               |
| `is_wanted`   | boolean     | not null, default false                     |
| `is_public`   | boolean     | not null, default false                     |
| `share_token` | text        | nullable, unique                            |
| `created_at`  | timestamptz | not null, default now()                     |
| `updated_at`  | timestamptz | not null, default now()                     |

### `deck_cards`

Cards in a deck, with zone and quantity.

| Column     | Type    | Constraints                                 |
| ---------- | ------- | ------------------------------------------- |
| `id`       | uuid    | primary key, default uuidv7()               |
| `deck_id`  | uuid    | not null, FK → decks.id (on delete cascade) |
| `card_id`  | uuid    | not null, FK → cards.id                     |
| `zone`     | text    | not null (main, sideboard)                  |
| `quantity` | integer | not null, default 1 (> 0)                   |

Unique constraint on `(deck_id, card_id, zone)`.

## List Tables

### `wish_lists` / `wish_list_items`

Wish lists track cards or specific printings the user wants to acquire.

| Column (wish_lists) | Type        | Constraints                                 |
| ------------------- | ----------- | ------------------------------------------- |
| `id`                | uuid        | primary key, default uuidv7()               |
| `user_id`           | text        | not null, FK → users.id (on delete cascade) |
| `name`              | text        | not null                                    |
| `rules`             | jsonb       | nullable                                    |
| `share_token`       | text        | nullable, unique                            |
| `created_at`        | timestamptz | not null, default now()                     |
| `updated_at`        | timestamptz | not null, default now()                     |

| Column (wish_list_items) | Type        | Constraints                                                |
| ------------------------ | ----------- | ---------------------------------------------------------- |
| `id`                     | uuid        | primary key, default uuidv7()                              |
| `wish_list_id`           | uuid        | not null, FK → wish_lists(id, user_id) (on delete cascade) |
| `user_id`                | text        | not null                                                   |
| `card_id`                | uuid        | nullable, FK → cards.id                                    |
| `printing_id`            | uuid        | nullable, FK → printings.id                                |
| `quantity_desired`       | integer     | not null, default 1 (> 0)                                  |
| `created_at`             | timestamptz | not null, default now()                                    |
| `updated_at`             | timestamptz | not null, default now()                                    |

XOR constraint: exactly one of `card_id` or `printing_id` must be set.

### `trade_lists` / `trade_list_items`

Trade lists mark specific owned copies as available for trade.

| Column (trade_lists) | Type        | Constraints                                 |
| -------------------- | ----------- | ------------------------------------------- |
| `id`                 | uuid        | primary key, default uuidv7()               |
| `user_id`            | text        | not null, FK → users.id (on delete cascade) |
| `name`               | text        | not null                                    |
| `rules`              | jsonb       | nullable                                    |
| `share_token`        | text        | nullable, unique                            |
| `created_at`         | timestamptz | not null, default now()                     |
| `updated_at`         | timestamptz | not null, default now()                     |

| Column (trade_list_items) | Type        | Constraints                                                 |
| ------------------------- | ----------- | ----------------------------------------------------------- |
| `id`                      | uuid        | primary key, default uuidv7()                               |
| `trade_list_id`           | uuid        | not null, FK → trade_lists(id, user_id) (on delete cascade) |
| `user_id`                 | text        | not null                                                    |
| `copy_id`                 | uuid        | not null, FK → copies(id, user_id) (on delete cascade)      |
| `created_at`              | timestamptz | not null, default now()                                     |
| `updated_at`              | timestamptz | not null, default now()                                     |

Unique constraint on `(trade_list_id, copy_id)`.

## Activity Log Tables

### `activities`

Top-level activity entries that group related collection changes (acquisitions, disposals, trades, reorganizations).

| Column        | Type        | Constraints                                             |
| ------------- | ----------- | ------------------------------------------------------- |
| `id`          | uuid        | primary key, default uuidv7()                           |
| `user_id`     | text        | not null, FK → users.id (on delete cascade)             |
| `type`        | text        | not null (acquisition, disposal, trade, reorganization) |
| `name`        | text        | nullable                                                |
| `date`        | date        | not null, default current_date                          |
| `description` | text        | nullable                                                |
| `is_auto`     | boolean     | not null, default false                                 |
| `created_at`  | timestamptz | not null, default now()                                 |
| `updated_at`  | timestamptz | not null, default now()                                 |

### `activity_items`

Individual copy-level changes within an activity.

| Column                 | Type        | Constraints                                                      |
| ---------------------- | ----------- | ---------------------------------------------------------------- |
| `id`                   | uuid        | primary key, default uuidv7()                                    |
| `activity_id`          | uuid        | not null, FK → activities(id, user_id, type) (on delete cascade) |
| `user_id`              | text        | not null                                                         |
| `activity_type`        | text        | not null                                                         |
| `copy_id`              | uuid        | nullable, FK → copies(id, user_id) (on delete set null)          |
| `printing_id`          | uuid        | not null, FK → printings.id                                      |
| `action`               | text        | not null (added, removed, moved)                                 |
| `from_collection_id`   | uuid        | nullable, FK → collections(id, user_id) (on delete set null)     |
| `from_collection_name` | text        | nullable — snapshot of collection name at time of action         |
| `to_collection_id`     | uuid        | nullable, FK → collections(id, user_id) (on delete set null)     |
| `to_collection_name`   | text        | nullable — snapshot of collection name at time of action         |
| `metadata_snapshot`    | jsonb       | nullable                                                         |
| `created_at`           | timestamptz | not null, default now()                                          |

CHECK constraints enforce valid action/type combinations (e.g. acquisitions can only have "added" items, disposals only "removed", trades both, reorganizations only "moved") and appropriate collection presence.

## Marketplace Tables

### `marketplace_groups`

Marketplace product group/expansion metadata. Used to associate marketplace groups with sets.

| Column         | Type        | Constraints                   |
| -------------- | ----------- | ----------------------------- |
| `id`           | uuid        | primary key, default uuidv7() |
| `marketplace`  | text        | not null                      |
| `group_id`     | integer     | not null                      |
| `name`         | text        | nullable                      |
| `abbreviation` | text        | nullable                      |
| `created_at`   | timestamptz | not null, default now()       |
| `updated_at`   | timestamptz | not null, default now()       |

Unique constraint on `(marketplace, group_id)`.

### `marketplace_products`

Links a marketplace product to a specific printing. One row per (marketplace, printing) pair.

| Column         | Type        | Constraints                                              |
| -------------- | ----------- | -------------------------------------------------------- |
| `id`           | uuid        | primary key, default uuidv7()                            |
| `marketplace`  | text        | not null (e.g. "tcgplayer", "cardmarket")                |
| `external_id`  | integer     | not null (> 0) — marketplace product ID                  |
| `group_id`     | integer     | not null, FK → marketplace_groups(marketplace, group_id) |
| `product_name` | text        | not null                                                 |
| `printing_id`  | uuid        | not null, FK → printings.id                              |
| `created_at`   | timestamptz | not null, default now()                                  |
| `updated_at`   | timestamptz | not null, default now()                                  |

Unique constraint on `(marketplace, printing_id)`. Indexes: `printing_id`.

### `marketplace_snapshots`

Price observations at a point in time. All monetary values are stored in integer cents.

| Column         | Type        | Constraints                             |
| -------------- | ----------- | --------------------------------------- |
| `id`           | uuid        | primary key, default uuidv7()           |
| `product_id`   | uuid        | not null, FK → marketplace_products.id  |
| `recorded_at`  | timestamptz | not null, default now()                 |
| `market_cents` | integer     | not null (>= 0)                         |
| `low_cents`    | integer     | nullable (>= 0)                         |
| `mid_cents`    | integer     | nullable (>= 0) — TCGplayer mid price   |
| `high_cents`   | integer     | nullable (>= 0) — TCGplayer high price  |
| `trend_cents`  | integer     | nullable (>= 0) — Cardmarket trend      |
| `avg1_cents`   | integer     | nullable (>= 0) — Cardmarket 1-day avg  |
| `avg7_cents`   | integer     | nullable (>= 0) — Cardmarket 7-day avg  |
| `avg30_cents`  | integer     | nullable (>= 0) — Cardmarket 30-day avg |

Unique constraint on `(product_id, recorded_at)`. Index on `(product_id, recorded_at)`.

### `marketplace_staging`

Staging table for marketplace prices that can't yet be matched to a specific printing (the marketplace group is known but the card isn't mapped yet). Staged rows are reconciled when marketplace mappings are updated.

| Column         | Type        | Constraints                                 |
| -------------- | ----------- | ------------------------------------------- |
| `id`           | uuid        | primary key, default uuidv7()               |
| `marketplace`  | text        | not null ("tcgplayer" or "cardmarket")      |
| `external_id`  | integer     | not null — marketplace product ID           |
| `group_id`     | integer     | not null — marketplace group ID             |
| `product_name` | text        | not null — original name for reconciliation |
| `finish`       | text        | not null ("normal" or "foil")               |
| `recorded_at`  | timestamptz | not null                                    |
| `market_cents` | integer     | not null                                    |
| `low_cents`    | integer     | nullable                                    |
| `mid_cents`    | integer     | nullable                                    |
| `high_cents`   | integer     | nullable                                    |
| `trend_cents`  | integer     | nullable                                    |
| `avg1_cents`   | integer     | nullable                                    |
| `avg7_cents`   | integer     | nullable                                    |
| `avg30_cents`  | integer     | nullable                                    |
| `created_at`   | timestamptz | not null, default now()                     |
| `updated_at`   | timestamptz | not null, default now()                     |

Unique constraint on `(marketplace, external_id, finish, recorded_at)`. Index on `(marketplace, group_id)`.

### `marketplace_staging_card_overrides`

Manual overrides that force a staged marketplace product to match a specific card when automatic name matching fails.

| Column        | Type        | Constraints             |
| ------------- | ----------- | ----------------------- |
| `marketplace` | text        | not null                |
| `external_id` | integer     | not null                |
| `finish`      | text        | not null                |
| `card_id`     | uuid        | not null, FK → cards.id |
| `created_at`  | timestamptz | not null, default now() |

Primary key on `(marketplace, external_id, finish)`.

### `marketplace_ignored_products`

Marketplace products explicitly marked to be skipped during price refresh.

| Column         | Type        | Constraints             |
| -------------- | ----------- | ----------------------- |
| `marketplace`  | text        | not null                |
| `external_id`  | integer     | not null                |
| `finish`       | text        | not null                |
| `product_name` | text        | not null                |
| `created_at`   | timestamptz | not null, default now() |
| `updated_at`   | timestamptz | not null, default now() |

Primary key on `(marketplace, external_id, finish)`.

## Candidate Tables (Card Ingestion Pipeline)

### `candidate_cards`

Staged card data from external providers. Candidates are reviewed and linked to canonical `cards` rows via the admin UI.

| Column        | Type        | Constraints                    |
| ------------- | ----------- | ------------------------------ |
| `id`          | uuid        | primary key, default uuidv7()  |
| `provider`    | text        | not null                       |
| `external_id` | text        | not null                       |
| `short_code`  | text        | nullable                       |
| `name`        | text        | not null                       |
| `norm_name`   | text        | not null — auto-set by trigger |
| `type`        | text        | nullable                       |
| `super_types` | text[]      | not null, default '{}'         |
| `domains`     | text[]      | not null                       |
| `might`       | integer     | nullable                       |
| `energy`      | integer     | nullable                       |
| `power`       | integer     | nullable                       |
| `might_bonus` | integer     | nullable                       |
| `rules_text`  | text        | nullable                       |
| `effect_text` | text        | nullable                       |
| `tags`        | text[]      | not null, default '{}'         |
| `extra_data`  | jsonb       | nullable                       |
| `checked_at`  | timestamptz | nullable — set when reviewed   |
| `created_at`  | timestamptz | not null, default now()        |
| `updated_at`  | timestamptz | not null, default now()        |

Unique indexes: `(provider, short_code)` where short_code is not null, `(provider, name)` where short_code is null.

### `candidate_printings`

Staged printing data from providers, linked to a candidate card. Can optionally be linked to a canonical printing.

| Column                | Type        | Constraints                                           |
| --------------------- | ----------- | ----------------------------------------------------- |
| `id`                  | uuid        | primary key, default uuidv7()                         |
| `candidate_card_id`   | uuid        | not null, FK → candidate_cards.id (on delete cascade) |
| `external_id`         | text        | not null                                              |
| `short_code`          | text        | not null                                              |
| `set_id`              | text        | nullable                                              |
| `set_name`            | text        | nullable                                              |
| `collector_number`    | integer     | nullable (> 0)                                        |
| `rarity`              | text        | nullable                                              |
| `art_variant`         | text        | nullable                                              |
| `is_signed`           | boolean     | nullable                                              |
| `finish`              | text        | nullable                                              |
| `artist`              | text        | nullable                                              |
| `public_code`         | text        | nullable                                              |
| `printed_rules_text`  | text        | nullable                                              |
| `printed_effect_text` | text        | nullable, default ''                                  |
| `flavor_text`         | text        | nullable, default ''                                  |
| `image_url`           | text        | nullable                                              |
| `extra_data`          | jsonb       | nullable                                              |
| `printing_id`         | uuid        | nullable, FK → printings.id                           |
| `promo_type_id`       | uuid        | nullable, FK → promo_types.id                         |
| `group_key`           | text        | not null — auto-set by trigger for deduplication      |
| `checked_at`          | timestamptz | nullable — set when reviewed                          |
| `created_at`          | timestamptz | not null, default now()                               |
| `updated_at`          | timestamptz | not null, default now()                               |

### `ignored_candidate_cards` / `ignored_candidate_printings`

Provider entities explicitly marked to be skipped during ingestion.

| Column (ignored_candidate_cards) | Type        | Constraints             |
| -------------------------------- | ----------- | ----------------------- |
| `id`                             | uuid        | primary key             |
| `provider`                       | text        | not null                |
| `external_id`                    | text        | not null                |
| `created_at`                     | timestamptz | not null, default now() |

| Column (ignored_candidate_printings) | Type        | Constraints             |
| ------------------------------------ | ----------- | ----------------------- |
| `id`                                 | uuid        | primary key             |
| `provider`                           | text        | not null                |
| `external_id`                        | text        | not null                |
| `finish`                             | text        | nullable                |
| `created_at`                         | timestamptz | not null, default now() |

### `printing_link_overrides`

Manual overrides that force a candidate printing to link to a specific printing by slug when automatic matching fails.

| Column          | Type        | Constraints             |
| --------------- | ----------- | ----------------------- |
| `external_id`   | text        | not null                |
| `finish`        | text        | not null                |
| `printing_slug` | text        | not null                |
| `created_at`    | timestamptz | not null, default now() |

Primary key on `(external_id, finish)`.

## Admin Tables

### `admins`

| Column       | Type        | Constraints                                    |
| ------------ | ----------- | ---------------------------------------------- |
| `user_id`    | text        | primary key, FK → users.id (on delete cascade) |
| `created_at` | timestamptz | not null, default now()                        |
| `updated_at` | timestamptz | not null, default now()                        |

### `feature_flags`

Runtime feature toggles managed via the admin panel.

| Column        | Type        | Constraints             |
| ------------- | ----------- | ----------------------- |
| `key`         | text        | primary key             |
| `enabled`     | boolean     | not null, default false |
| `description` | text        | nullable                |
| `created_at`  | timestamptz | not null, default now() |
| `updated_at`  | timestamptz | not null, default now() |

### `provider_settings`

Per-provider configuration for the candidate ingestion pipeline (display order, visibility).

| Column       | Type        | Constraints             |
| ------------ | ----------- | ----------------------- |
| `provider`   | text        | primary key             |
| `sort_order` | integer     | not null, default 0     |
| `is_hidden`  | boolean     | not null, default false |
| `created_at` | timestamptz | not null, default now() |
| `updated_at` | timestamptz | not null, default now() |

## Auth Tables

Managed by [better-auth](https://www.better-auth.com/). Column names are mapped to snake*case via the auth config in `apps/api/src/auth.ts`. These tables follow better-auth's schema — column names like `email_verified` don't use the `is*`/`has\_` prefix convention from the core tables.

### `users`

| Column           | Type        | Constraints             |
| ---------------- | ----------- | ----------------------- |
| `id`             | text        | primary key             |
| `email`          | text        | not null, unique        |
| `name`           | text        | nullable                |
| `email_verified` | boolean     | not null, default false |
| `image`          | text        | nullable                |
| `created_at`     | timestamptz | not null, default now() |
| `updated_at`     | timestamptz | not null, default now() |

### `sessions`

| Column       | Type        | Constraints                                 |
| ------------ | ----------- | ------------------------------------------- |
| `id`         | text        | primary key                                 |
| `user_id`    | text        | not null, FK → users.id (on delete cascade) |
| `token`      | text        | not null                                    |
| `expires_at` | timestamptz | not null                                    |
| `ip_address` | text        | nullable                                    |
| `user_agent` | text        | nullable                                    |
| `created_at` | timestamptz | not null, default now()                     |
| `updated_at` | timestamptz | not null, default now()                     |

Indexes: `user_id`, `token` (unique).

### `accounts`

OAuth and credential provider links.

| Column                     | Type        | Constraints                                 |
| -------------------------- | ----------- | ------------------------------------------- |
| `id`                       | text        | primary key                                 |
| `user_id`                  | text        | not null, FK → users.id (on delete cascade) |
| `account_id`               | text        | not null                                    |
| `provider_id`              | text        | not null                                    |
| `access_token`             | text        | nullable                                    |
| `refresh_token`            | text        | nullable                                    |
| `access_token_expires_at`  | timestamptz | nullable                                    |
| `refresh_token_expires_at` | timestamptz | nullable                                    |
| `scope`                    | text        | nullable                                    |
| `id_token`                 | text        | nullable                                    |
| `password`                 | text        | nullable                                    |
| `created_at`               | timestamptz | not null, default now()                     |
| `updated_at`               | timestamptz | not null, default now()                     |

Indexes: `user_id`.

### `verifications`

Email verification tokens. Rows are deleted by better-auth after use, and expired rows are cleaned up on the next verification fetch — no external cleanup needed.

| Column       | Type        | Constraints             |
| ------------ | ----------- | ----------------------- |
| `id`         | text        | primary key             |
| `identifier` | text        | not null                |
| `value`      | text        | not null                |
| `expires_at` | timestamptz | not null                |
| `created_at` | timestamptz | not null, default now() |
| `updated_at` | timestamptz | not null, default now() |

## Catalog Refresh

Card data is ingested via JSON upload through the admin API (`POST /api/admin/candidates/upload`). External scripts produce JSON files conforming to `candidateUploadSchema`, which are uploaded through the admin UI or API directly. See `docs/adr/008-supplemental-card-import.md` for design rationale.

- JSON payload contains a `provider` label and an array of `candidates`, each with card metadata and printings
- Validated against `uploadCandidatesSchema` (defined in `apps/api/src/routes/admin/candidate-cards/schemas.ts`)
- Ingested by `ingestCandidates()` which matches by `(provider, short_code)` or `(provider, name)`, inserting new records or updating changed ones
- New candidate cards are staged with `checked_at = null` until reviewed in the admin UI
- All operations are transactional per-card

## Price Refresh

Daily price data is fetched from two sources via the admin API (`POST /api/admin/refresh-tcgplayer-prices` / `POST /api/admin/refresh-cardmarket-prices`):

- **TCGCSV (TCGplayer)** — USD prices. Products matched to printings by collector number (`Number` extended data field), with card name fallback for ambiguous or missing numbers.
- **Cardmarket** — EUR prices. Products matched by card name within auto-discovered expansions.

Key differences from the catalog refresh:

- **Appends** snapshots to `marketplace_snapshots` (vs. catalog refresh which upserts candidates)
- **Auto-discovers** group/expansion → set mapping by scoring product numbers or names against DB data — no hardcoded mapping tables
- **Idempotent** via ON CONFLICT on `(product_id, recorded_at)` — same-day re-runs update rather than duplicate
- **Two currencies** — TCGCSV writes USD sources, Cardmarket writes EUR sources, each with source-specific fields

Source-specific secondary price columns:

| Source     | Columns used                                             |
| ---------- | -------------------------------------------------------- |
| tcgplayer  | `mid_cents`, `high_cents`                                |
| cardmarket | `trend_cents`, `avg1_cents`, `avg7_cents`, `avg30_cents` |

## API Endpoints

### Public (no auth required)

| Method   | Path                      | Description                                                                   |
| -------- | ------------------------- | ----------------------------------------------------------------------------- |
| GET/POST | `/api/auth/**`            | Auth handler — delegated to better-auth (sign-up, login, email OTP, etc.)     |
| GET      | `/api/catalog`            | All sets with cards/printings, grouped by set                                 |
| GET      | `/api/prices`             | Latest market prices keyed by printing ID                                     |
| GET      | `/api/prices/:id/history` | Price history for a specific printing                                         |
| GET      | `/api/feature-flags`      | Enabled/disabled feature flags                                                |
| GET      | `/api/health`             | Health check — validates DB connectivity, migration status, and data presence |

### Authenticated (require user session)

| Method | Path                                 | Description                                          |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| GET    | `/api/collections`                   | List user's collections                              |
| POST   | `/api/collections`                   | Create collection                                    |
| GET    | `/api/collections/:id`               | Get single collection                                |
| PATCH  | `/api/collections/:id`               | Update collection                                    |
| DELETE | `/api/collections/:id`               | Delete collection                                    |
| GET    | `/api/collections/:id/copies`        | List copies in a collection                          |
| GET    | `/api/copies`                        | List all user's copies                               |
| POST   | `/api/copies`                        | Add copies (acquisition)                             |
| POST   | `/api/copies/move`                   | Move copies between collections                      |
| POST   | `/api/copies/dispose`                | Dispose copies                                       |
| GET    | `/api/copies/count`                  | Owned copy count per printing                        |
| GET    | `/api/copies/:id`                    | Get single copy                                      |
| GET    | `/api/decks`                         | List user's decks                                    |
| POST   | `/api/decks`                         | Create deck                                          |
| GET    | `/api/decks/:id`                     | Get deck with cards                                  |
| PATCH  | `/api/decks/:id`                     | Update deck metadata                                 |
| DELETE | `/api/decks/:id`                     | Delete deck                                          |
| PUT    | `/api/decks/:id/cards`               | Replace all deck cards                               |
| GET    | `/api/decks/:id/availability`        | Per-card availability for wanted deck                |
| GET    | `/api/wish-lists`                    | List wish lists                                      |
| POST   | `/api/wish-lists`                    | Create wish list                                     |
| GET    | `/api/wish-lists/:id`                | Get wish list with items                             |
| PATCH  | `/api/wish-lists/:id`                | Update wish list                                     |
| DELETE | `/api/wish-lists/:id`                | Delete wish list                                     |
| POST   | `/api/wish-lists/:id/items`          | Add wish list item                                   |
| PATCH  | `/api/wish-lists/:id/items/:itemId`  | Update wish list item                                |
| DELETE | `/api/wish-lists/:id/items/:itemId`  | Remove wish list item                                |
| GET    | `/api/trade-lists`                   | List trade lists                                     |
| POST   | `/api/trade-lists`                   | Create trade list                                    |
| GET    | `/api/trade-lists/:id`               | Get trade list with items                            |
| PATCH  | `/api/trade-lists/:id`               | Update trade list                                    |
| DELETE | `/api/trade-lists/:id`               | Delete trade list                                    |
| POST   | `/api/trade-lists/:id/items`         | Add copy to trade list                               |
| DELETE | `/api/trade-lists/:id/items/:itemId` | Remove copy from trade list                          |
| GET    | `/api/activities`                    | List activities (cursor-paginated)                   |
| GET    | `/api/activities/:id`                | Get activity detail                                  |
| GET    | `/api/shopping-list`                 | Unified shopping list (deck shortfalls + wish items) |

### Admin (require admin role)

| Method | Path                                   | Description                         |
| ------ | -------------------------------------- | ----------------------------------- |
| GET    | `/api/admin/me`                        | Check admin status                  |
| GET    | `/api/admin/cron-status`               | Get cron job next-run times         |
| POST   | `/api/admin/refresh-tcgplayer-prices`  | Trigger TCGPlayer price refresh     |
| POST   | `/api/admin/refresh-cardmarket-prices` | Trigger Cardmarket price refresh    |
| POST   | `/api/admin/clear-prices`              | Clear price data for marketplace    |
| \*     | `/api/admin/sets/**`                   | Set CRUD + reorder                  |
| \*     | `/api/admin/feature-flags/**`          | Feature flag CRUD                   |
| \*     | `/api/admin/candidates/**`             | Candidate card/printing curation    |
| \*     | `/api/admin/ignored-candidates/**`     | Manage ignored candidates           |
| \*     | `/api/admin/ignored-products/**`       | Manage ignored marketplace products |
| \*     | `/api/admin/marketplace-groups/**`     | Marketplace group management        |
| \*     | `/api/admin/marketplace-mappings/**`   | Marketplace ↔ printing mappings     |
| \*     | `/api/admin/staging-card-overrides/**` | Staging card override management    |
| \*     | `/api/admin/promo-types/**`            | Promo type CRUD                     |
| \*     | `/api/admin/provider-settings/**`      | Provider settings management        |
| POST   | `/api/admin/rehost-images`             | Rehost card images to CDN           |
| GET    | `/api/admin/rehost-status`             | Get image rehosting status          |
| GET    | `/api/admin/missing-images`            | List cards with missing images      |
