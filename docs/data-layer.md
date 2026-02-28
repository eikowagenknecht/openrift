# Data Layer

Three tables in PostgreSQL, managed by Kysely migrations in `packages/shared/src/db/migrations/`.

## `sets`

Set metadata.

| Column        | Type        | Constraints             |
|---------------|-------------|-------------------------|
| `id`          | text        | primary key             |
| `name`        | text        | not null                |
| `total_cards` | integer     | not null                |
| `created_at`  | timestamptz | not null, default now() |

## `cards`

Card data. One row per card — variants (Alt Art, Signed, etc.) are not separate rows.

| Column             | Type        | Constraints                                 |
|--------------------|-------------|---------------------------------------------|
| `id`               | text        | primary key                                 |
| `name`             | text        | not null                                    |
| `type`             | text        | not null (Legend, Unit, Rune, etc.)         |
| `super_types`      | text[]      | not null, default '{}'                      |
| `rarity`           | text        | not null (Common → Epic, Showcase)          |
| `collector_number` | integer     | not null                                    |
| `faction`          | text        | not null                                    |
| `might`            | integer     | not null                                    |
| `energy`           | integer     | not null                                    |
| `power`            | integer     | not null                                    |
| `keywords`         | text[]      | not null, default '{}'                      |
| `description`      | text        | not null                                    |
| `effect`           | text        | not null, default ''                        |
| `might_bonus`      | integer     | not null, default 0                         |
| `set_id`           | text        | not null, FK → sets.id (on delete restrict) |
| `thumbnail_url`    | text        | not null                                    |
| `full_url`         | text        | not null                                    |
| `artist`           | text        | not null                                    |
| `tags`             | text[]      | not null, default '{}'                      |
| `orientation`      | text        | not null (portrait, landscape)              |
| `public_code`      | text        | not null                                    |
| `created_at`       | timestamptz | not null, default now()                     |
| `updated_at`       | timestamptz | not null, default now()                     |

Indexes: `set_id`, `rarity`, `type`.

## `prices`

Price points per card and variant. All monetary values are stored in cents.

| Column             | Type        | Constraints                                 |
|--------------------|-------------|---------------------------------------------|
| `id`               | serial      | primary key                                 |
| `card_id`          | text        | not null, FK → cards.id (on delete cascade) |
| `variant`          | text        | not null, default 'Normal' (Normal or Foil) |
| `low_cents`        | integer     | nullable                                    |
| `mid_cents`        | integer     | nullable                                    |
| `high_cents`       | integer     | nullable                                    |
| `market_cents`     | integer     | not null                                    |
| `direct_low_cents` | integer     | nullable                                    |
| `product_id`       | integer     | nullable                                    |
| `url`              | text        | nullable                                    |
| `source`           | text        | not null                                    |
| `recorded_at`      | timestamptz | not null, default now()                     |

Indexes: `(card_id, variant)`, `recorded_at`.

## Seed Data

Card and price data lives in `data/` (gitignored — not checked into the public repo). Seeded via `bun db:seed`:

- Sets and cards are upserted (insert or update on conflict)
- Prices are truncated and re-inserted on each run
- Dollar amounts from JSON are converted to cents for storage

## API Endpoints

| Method | Path          | Response                                                                                            |
|--------|---------------|-----------------------------------------------------------------------------------------------------|
| GET    | `/api/cards`  | All sets with their cards, grouped by set. Transforms DB rows into frontend `Card` types.           |
| GET    | `/api/prices` | Price data keyed by card ID, with optional `normal` and `foil` variants. Converts cents to dollars. |
| GET    | `/api/health` | `{ status: "ok" }`                                                                                  |
