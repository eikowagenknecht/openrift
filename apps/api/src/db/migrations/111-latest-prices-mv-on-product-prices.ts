import type { Kysely } from "kysely";
import { sql } from "kysely";

// Rewrite mv_latest_printing_prices to read from marketplace_product_prices
// instead of marketplace_snapshots. Prices are keyed on the marketplace SKU
// now (one row per product × recorded_at), so we join
// printing → variant → product → prices and pick the latest row per SKU.
//
// The headline price semantics stay identical. The cross-variant fan-out join
// that migration 108 introduced (snap_mpv to share snapshots across sibling
// variants of the same product) is no longer needed — one price row already
// covers every sibling binding.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

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

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (mpv.printing_id, mp.marketplace)
      mpv.printing_id      AS printing_id,
      mp.marketplace       AS marketplace,
      CASE WHEN mp.marketplace = 'cardtrader'
           THEN COALESCE(snap.zero_low_cents, snap.low_cents)
           WHEN mp.marketplace = 'cardmarket'
           THEN COALESCE(snap.low_cents, snap.market_cents)
           ELSE COALESCE(snap.market_cents, snap.low_cents)
      END                  AS headline_cents
    FROM marketplace_product_variants mpv
    JOIN marketplace_products         mp       ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_product_variants snap_mpv ON snap_mpv.marketplace_product_id = mp.id
    JOIN marketplace_snapshots        snap     ON snap.variant_id = snap_mpv.id
    WHERE CASE WHEN mp.marketplace = 'cardtrader'
               THEN COALESCE(snap.zero_low_cents, snap.low_cents)
               WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(snap.low_cents, snap.market_cents)
               ELSE COALESCE(snap.market_cents, snap.low_cents)
          END IS NOT NULL
    ORDER BY mpv.printing_id, mp.marketplace, (snap.zero_low_cents IS NULL), snap.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}
