import type { Kysely } from "kysely";
import { sql } from "kysely";

// Simplify mv_latest_printing_prices after the sibling backfill.
//
// Before migration 107, the view fanned language-aggregate products out to
// every sibling printing at read time via a `(source, target)` self-join
// guarded by `mp.language IS NULL OR source.id = target.id`. Migration 107
// materialised those fan-out rows as explicit variants.
//
// Snapshots are still attached per-variant, and after the backfill only the
// originally-mapped variant has recorded snapshots — the new sibling
// variants will receive their own copies once the next refresh cycle runs.
// To surface prices on every printing *immediately*, the view joins
// snapshots through the PRODUCT: each variant sees the snapshots of any
// sibling variant that shares the same `marketplace_product_id`. Once the
// next refresh writes snapshots to every variant, the cross-product join
// degenerates to a direct lookup (DISTINCT ON trims duplicates away), so
// this stays correct either way.

export async function up(db: Kysely<unknown>): Promise<void> {
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

  // Populate the view so production reads reflect current prices immediately
  // after the deploy, not only after the next price-refresh cron.
  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (target.id, mp.marketplace)
      target.id           AS printing_id,
      mp.marketplace      AS marketplace,
      CASE WHEN mp.marketplace = 'cardtrader'
           THEN COALESCE(snap.zero_low_cents, snap.low_cents)
           WHEN mp.marketplace = 'cardmarket'
           THEN COALESCE(snap.low_cents, snap.market_cents)
           ELSE COALESCE(snap.market_cents, snap.low_cents)
      END                 AS headline_cents
    FROM printings target
    JOIN printings source
      ON  source.card_id      = target.card_id
      AND source.short_code   = target.short_code
      AND source.finish       = target.finish
      AND source.art_variant  = target.art_variant
      AND source.is_signed    = target.is_signed
      AND source.marker_slugs = target.marker_slugs
    JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
    JOIN marketplace_products         mp  ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_snapshots        snap ON snap.variant_id = mpv.id
    WHERE CASE WHEN mp.marketplace = 'cardtrader'
               THEN COALESCE(snap.zero_low_cents, snap.low_cents)
               WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(snap.low_cents, snap.market_cents)
               ELSE COALESCE(snap.market_cents, snap.low_cents)
          END IS NOT NULL
      AND (mp.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, (snap.zero_low_cents IS NULL), snap.recorded_at DESC
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}
