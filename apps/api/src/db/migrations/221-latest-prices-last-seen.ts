import type { Kysely } from "kysely";
import { sql } from "kysely";

// Publish how old each headline price is.
//
// The price pipeline only writes a snapshot when a marketplace returns data
// for a SKU. When the last listing for a card goes, it simply stops writing,
// and nothing downstream could tell "0.32 today" from "0.32 four weeks ago".
// Today 178 CardTrader products have not been seen in over a week and 78 not
// in over a month, so roughly 4% of that marketplace carries a price nobody
// can transact at, counted in collection totals as if it were live.
//
// `mv_daily_printing_prices` only holds days a snapshot actually landed on —
// it never invents a row for a quiet day — so the latest view's own `day` is
// already the answer. Surfacing it costs nothing but a column.
//
// This does not change any price. It lets callers decide what to do about an
// old one, which is deliberately left to them: the arbitrage side wants
// same-day data or nothing, while a collection total showing a month-old price
// is a display question, not a pricing one.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (d.printing_id, d.marketplace)
      d.printing_id    AS printing_id,
      d.marketplace    AS marketplace,
      d.headline_cents AS headline_cents,
      d.day            AS last_seen
    FROM mv_daily_printing_prices d
    ORDER BY d.printing_id, d.marketplace, d.day DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (d.printing_id, d.marketplace)
      d.printing_id    AS printing_id,
      d.marketplace    AS marketplace,
      d.headline_cents AS headline_cents
    FROM mv_daily_printing_prices d
    ORDER BY d.printing_id, d.marketplace, d.day DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}
