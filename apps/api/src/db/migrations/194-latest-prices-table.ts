import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-027 prices vertical: replace the `mv_latest_printing_prices` materialized
// view with a real maintained table `latest_printing_prices`.
//
// WHY a table instead of the MV:
//   Current marketplace prices are now synced to the client via Electric shapes.
//   Electric replicates plain table rows over Postgres logical replication — it
//   cannot sync a materialized view (a `REFRESH MATERIALIZED VIEW` emits no
//   logical-replication change events the shape could ride), and it cannot
//   express "the latest row per (printing, marketplace)" over the 466k-row
//   `marketplace_product_prices` history table. So the denormalized "latest
//   headline per key" result has to live in a plain table that Electric can
//   publish. This is the same denormalize-for-sync pattern used for
//   `printings.canonical_rank` (migration 163).
//
// SHAPE: one row per (printing_id, marketplace) holding the headline price in
//   cents — the exact rows the old MV held, same PK. The table is MAINTAINED by
//   `refreshLatestPrices()` (apps/api/src/repositories/marketplace.ts) on every
//   price import (the three price-refresh crons + the admin op all call it). It
//   recomputes the latest headline per key with the same DISTINCT-ON query the
//   MV used, upserts changed rows, and deletes keys that no longer have a price.
//
// UNCHANGED: the full price history table `marketplace_product_prices` (466k
//   time-series rows) is NOT touched and is NEVER synced — it stays behind the
//   on-demand `/prices/{printingId}/history` endpoint.
//
// This migration fully REPLACES `mv_latest_printing_prices` (one source of
//   truth): it backfills the new table from the MV, then drops the MV.
//
// No FK on `printing_id`: the MV never enforced one (a printing row can lag a
//   price import), so the table matches that looseness. Electric needs a PK,
//   which `(printing_id, marketplace)` provides.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE latest_printing_prices (
      printing_id   uuid        NOT NULL,
      marketplace   text        NOT NULL,
      headline_cents integer    NOT NULL CHECK (headline_cents >= 0),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (printing_id, marketplace)
    )
  `.execute(db);

  await sql`
    COMMENT ON TABLE latest_printing_prices IS
      'Latest headline marketplace price per (printing_id, marketplace), in cents. Replaces the mv_latest_printing_prices materialized view: this is a real table so Electric can sync current prices to the client (a materialized view emits no logical-replication events). Maintained by refreshLatestPrices() on every price import; the full price history lives in marketplace_product_prices and is never synced.'
  `.execute(db);

  // Backfill from the existing MV before dropping it — identical columns + PK.
  await sql`
    INSERT INTO latest_printing_prices (printing_id, marketplace, headline_cents)
    SELECT printing_id, marketplace, headline_cents
    FROM mv_latest_printing_prices
  `.execute(db);

  await sql`DROP MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS latest_printing_prices`.execute(db);

  // Recreate the original MV verbatim (definition from migration 111).
  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (mpv.printing_id, mp.marketplace)
      mpv.printing_id      AS printing_id,
      mp.marketplace       AS marketplace,
      CASE WHEN mp.marketplace = 'cardtrader'
           THEN COALESCE(pp.zero_low_cents, pp.low_cents)
           WHEN mp.marketplace = 'cardmarket'
           THEN COALESCE(pp.low_cents, pp.market_cents)
           ELSE COALESCE(pp.market_cents, pp.low_cents)
      END                  AS headline_cents
    FROM marketplace_product_variants mpv
    JOIN marketplace_products         mp ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_product_prices   pp ON pp.marketplace_product_id = mp.id
    WHERE CASE WHEN mp.marketplace = 'cardtrader'
               THEN COALESCE(pp.zero_low_cents, pp.low_cents)
               WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(pp.low_cents, pp.market_cents)
               ELSE COALESCE(pp.market_cents, pp.low_cents)
          END IS NOT NULL
    ORDER BY mpv.printing_id, mp.marketplace, (pp.zero_low_cents IS NULL), pp.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}
