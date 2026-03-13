# Data Layer

PostgreSQL database managed by Kysely migrations in `packages/shared/src/db/migrations/`.

## Naming Conventions

| Element         | Convention                         | Example                      |
| --------------- | ---------------------------------- | ---------------------------- |
| Tables          | `snake_case`, plural               | `cards`, `user_decks`        |
| Columns         | `snake_case`                       | `collector_number`, `set_id` |
| Foreign keys    | `{referenced_table_singular}_id`   | `card_id`, `user_id`         |
| Indexes         | `idx_{table}_{columns}`            | `idx_printings_set_id`       |
| Timestamps      | `timestamptz`, `_at` suffix        | `created_at`, `expires_at`   |
| Monetary values | integer cents, `_cents` suffix     | `market_cents`, `low_cents`  |
| Boolean columns | Descriptive prefix (`is_`, `has_`) | `is_signed`, `is_promo`      |

**Rationale:** PostgreSQL folds unquoted identifiers to lowercase, so `snake_case` avoids the need for quoting. Plural table names are used consistently throughout — including join tables (e.g. `deck_cards`).

## Core Tables

### `sets`

Set metadata. The `id` is the stable set code (e.g. "OGS", "OGN") derived from card ID prefixes — not the human-readable name.

| Column          | Type        | Constraints                                                                            |
| --------------- | ----------- | -------------------------------------------------------------------------------------- |
| `id`            | text        | primary key (set code)                                                                 |
| `name`          | text        | not null                                                                               |
| `printed_total` | integer     | not null — the official denominator (e.g. 298 in "001/298"), not the actual card count |
| `created_at`    | timestamptz | not null, default now()                                                                |
| `updated_at`    | timestamptz | not null, default now()                                                                |

### `cards`

Game card identity — one row per unique card. Stats and rules live here; physical product details (art, rarity, finish) live in `printings`.

| Column        | Type        | Constraints                                             |
| ------------- | ----------- | ------------------------------------------------------- |
| `id`          | text        | primary key (base printing source ID, e.g. "OGN-027")   |
| `name`        | text        | not null                                                |
| `type`        | text        | not null (Legend, Unit, Rune, Spell, Gear, Battlefield) |
| `super_types` | text[]      | not null, default '{}'                                  |
| `domains`     | text[]      | not null                                                |
| `might`       | integer     | nullable — Unit only                                    |
| `energy`      | integer     | nullable — Unit, Spell, Gear only                       |
| `power`       | integer     | nullable — Unit, Spell, Gear only                       |
| `might_bonus` | integer     | nullable — Gear only                                    |
| `keywords`    | text[]      | not null, default '{}'                                  |
| `rules_text`  | text        | not null                                                |
| `effect_text` | text        | not null, default ''                                    |
| `tags`        | text[]      | not null, default '{}'                                  |
| `created_at`  | timestamptz | not null, default now()                                 |
| `updated_at`  | timestamptz | not null, default now()                                 |

Stats are nullable with type-specific semantics: `might` is only set for Units, `might_bonus` only for Gear, and `energy`/`power` only for Unit, Spell, and Gear.

### `printings`

Physical product variations of a game card (art, rarity, finish, etc.). One card can have many printings across sets and variants.

| Column                | Type        | Constraints                                       |
| --------------------- | ----------- | ------------------------------------------------- |
| `id`                  | text        | primary key (composite, see below)                |
| `card_id`             | text        | not null, FK → cards.id                           |
| `set_id`              | text        | not null, FK → sets.id                            |
| `source_id`           | text        | not null                                          |
| `collector_number`    | integer     | not null                                          |
| `rarity`              | text        | not null (Common, Uncommon, Rare, Epic, Showcase) |
| `art_variant`         | text        | not null                                          |
| `is_signed`           | boolean     | not null, default false                           |
| `is_promo`            | boolean     | not null, default false                           |
| `finish`              | text        | not null (normal, foil)                           |
| `image_url`           | text        | not null                                          |
| `artist`              | text        | not null                                          |
| `public_code`         | text        | not null                                          |
| `printed_rules_text`  | text        | not null (may differ from card's canonical text)  |
| `printed_effect_text` | text        | not null, default ''                              |
| `created_at`          | timestamptz | not null, default now()                           |
| `updated_at`          | timestamptz | not null, default now()                           |

**Composite ID format:** `{source_id}:{art_variant}:{signed?}:{promo?}:{finish}` — e.g. `OGN-027:a::foil`. This makes IDs deterministic and reproducible across refresh runs.

Indexes: `card_id`, `set_id`, `rarity`. Unique constraint on `(source_id, art_variant, is_signed, is_promo, finish)`.

All FKs use `NO ACTION` on delete — deleting a card or set is blocked while printings reference it. This is intentional: printings are the primary unit of ownership (collections, wishlists) so they must never be silently removed.

### `price_sources`

Marketplace source for a printing — which marketplace sells this printing and its product URL. One row per (printing, source) pair.

| Column        | Type        | Constraints                               |
| ------------- | ----------- | ----------------------------------------- |
| `id`          | serial      | primary key                               |
| `printing_id` | text        | not null, FK → printings.id               |
| `source`      | text        | not null (e.g. "tcgplayer", "cardmarket") |
| `currency`    | text        | not null, default 'USD'                   |
| `external_id` | integer     | nullable — marketplace product ID         |
| `url`         | text        | nullable — marketplace product URL        |
| `created_at`  | timestamptz | not null, default now()                   |
| `updated_at`  | timestamptz | not null, default now()                   |

Unique constraint on `(printing_id, source)`. Indexes: `printing_id`. FK uses `NO ACTION` on delete.

### `price_snapshots`

Price observations at a point in time. All monetary values are stored in integer cents.

| Column         | Type        | Constraints                          |
| -------------- | ----------- | ------------------------------------ |
| `id`           | serial      | primary key                          |
| `source_id`    | integer     | not null, FK → price_sources.id      |
| `recorded_at`  | timestamptz | not null, default now()              |
| `market_cents` | integer     | not null                             |
| `low_cents`    | integer     | nullable                             |
| `mid_cents`    | integer     | nullable — TCGplayer mid price       |
| `high_cents`   | integer     | nullable — TCGplayer high price      |
| `trend_cents`  | integer     | nullable — Cardmarket trend price    |
| `avg1_cents`   | integer     | nullable — Cardmarket 1-day average  |
| `avg7_cents`   | integer     | nullable — Cardmarket 7-day average  |
| `avg30_cents`  | integer     | nullable — Cardmarket 30-day average |

Unique constraint on `(source_id, recorded_at)`. Indexes: `source_id`, `recorded_at`. FK uses `NO ACTION` on delete.

### `price_staging`

Staging table for marketplace prices that don't match any printing in the DB. When a TCGCSV or Cardmarket product has prices but can't be matched to a specific printing (the set is known via auto-discovery but the card isn't in the catalog yet), the price data is captured here instead of being discarded.

At the start of each price refresh run (`refresh-tcgplayer-prices` or `refresh-cardmarket-prices`), staged rows for that source are reconciled against current DB printings: any rows whose `product_name` now matches a card in `namesBySet` are promoted to `price_sources` + `price_snapshots` and deleted from staging. This happens automatically — no manual intervention is needed when new cards are added via `refresh-catalog`.

| Column         | Type        | Constraints                                 |
| -------------- | ----------- | ------------------------------------------- |
| `id`           | serial      | primary key                                 |
| `source`       | text        | not null ("tcgplayer" or "cardmarket")      |
| `set_id`       | text        | not null, FK → sets.id                      |
| `external_id`  | integer     | nullable — marketplace product ID           |
| `product_name` | text        | not null — original name for reconciliation |
| `currency`     | text        | not null ("USD" or "EUR")                   |
| `finish`       | text        | not null ("normal" or "foil")               |
| `recorded_at`  | timestamptz | not null                                    |
| `market_cents` | integer     | not null                                    |
| `low_cents`    | integer     | nullable                                    |
| `mid_cents`    | integer     | nullable — TCGplayer mid price              |
| `high_cents`   | integer     | nullable — TCGplayer high price             |
| `trend_cents`  | integer     | nullable — Cardmarket trend price           |
| `avg1_cents`   | integer     | nullable — Cardmarket 1-day average         |
| `avg7_cents`   | integer     | nullable — Cardmarket 7-day average         |
| `avg30_cents`  | integer     | nullable — Cardmarket 30-day average        |
| `created_at`   | timestamptz | not null, default now()                     |

Unique constraint on `(source, external_id, finish, recorded_at)`. Indexes: `set_id`. FK on `set_id` (not `printing_id`) because the set is known but the specific printing is not.

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

Card data is ingested via JSON upload through the admin API (`POST /api/admin/card-sources/upload`). External scripts produce JSON files conforming to `candidateUploadSchema`, which are uploaded through the admin UI or API directly. See `docs/adr/008-supplemental-card-import.md` for design rationale.

- JSON payload contains a `source` label and an array of `candidates`, each with card metadata and printings
- Validated against `candidateUploadSchema` / `candidateCardSchema` (defined in `packages/shared/src/schemas.ts`)
- Ingested by `ingestCardSources()` which matches by `(source, source_id)` or `(source, name)`, inserting new records or updating changed ones
- New card sources are staged with `card_id = null` until linked in the admin UI
- All operations are transactional per-card

## Price Refresh

Daily price data is fetched from two sources via the admin API (`POST /api/admin/refresh-tcgplayer-prices` / `POST /api/admin/refresh-cardmarket-prices`):

- **TCGCSV (TCGplayer)** — USD prices. Products matched to printings by collector number (`Number` extended data field), with card name fallback for ambiguous or missing numbers.
- **Cardmarket** — EUR prices. Products matched by card name within auto-discovered expansions.

Key differences from the catalog refresh:

- **Appends** snapshots to `price_snapshots` (vs. catalog refresh which upserts cards/printings)
- **Auto-discovers** group/expansion → set mapping by scoring product numbers or names against DB data — no hardcoded mapping tables
- **Idempotent** via ON CONFLICT on `(source_id, recorded_at)` — same-day re-runs update rather than duplicate
- **Two currencies** — TCGCSV writes USD sources, Cardmarket writes EUR sources, each with source-specific `extra` fields

Source-specific secondary price columns:

| Source     | Columns used                                             |
| ---------- | -------------------------------------------------------- |
| tcgplayer  | `mid_cents`, `high_cents`                                |
| cardmarket | `trend_cents`, `avg1_cents`, `avg7_cents`, `avg30_cents` |

## API Endpoints

| Method   | Path                                   | Description                                                                                        |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET/POST | `/api/auth/**`                         | Auth handler — delegated to better-auth (sign-up, login, email OTP, sessions, etc.)                |
| GET      | `/api/cards`                           | All sets with their cards/printings, grouped by set. Joins cards + printings tables.               |
| GET      | `/api/prices`                          | Price data keyed by printing ID. Joins price_sources + price_snapshots, converts cents to dollars. |
| GET      | `/api/health`                          | Health check — validates DB connectivity, migration status, and seed data presence.                |
| POST     | `/api/admin/refresh-catalog`           | Re-fetch card catalog from the Riftbound gallery. Requires admin auth.                             |
| POST     | `/api/admin/refresh-tcgplayer-prices`  | Refresh TCGPlayer (USD) prices. Requires admin auth.                                               |
| POST     | `/api/admin/refresh-cardmarket-prices` | Refresh Cardmarket (EUR) prices. Requires admin auth.                                              |
