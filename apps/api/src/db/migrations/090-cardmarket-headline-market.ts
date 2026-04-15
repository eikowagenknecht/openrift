import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop and recreate mv_latest_printing_prices so every marketplace uses
  // market_cents (with low_cents fallback) as the chip headline. Previously
  // Cardmarket was special-cased to prefer low_cents.
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (target.id, mp.marketplace)
      target.id                                           AS printing_id,
      mp.marketplace                                      AS marketplace,
      COALESCE(snap.market_cents, snap.low_cents)         AS headline_cents
    FROM printings target
    JOIN printings source
      ON  source.card_id      = target.card_id
      AND source.short_code   = target.short_code
      AND source.finish       = target.finish
      AND source.art_variant  = target.art_variant
      AND source.is_signed    = target.is_signed
      AND source.promo_type_id IS NOT DISTINCT FROM target.promo_type_id
    JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
    JOIN marketplace_products         mp  ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_snapshots        snap ON snap.variant_id = mpv.id
    WHERE COALESCE(snap.market_cents, snap.low_cents) IS NOT NULL
      AND (mpv.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, snap.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (target.id, mp.marketplace)
      target.id           AS printing_id,
      mp.marketplace      AS marketplace,
      CASE WHEN mp.marketplace = 'cardmarket'
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
      AND source.promo_type_id IS NOT DISTINCT FROM target.promo_type_id
    JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
    JOIN marketplace_products         mp  ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_snapshots        snap ON snap.variant_id = mpv.id
    WHERE CASE WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(snap.low_cents, snap.market_cents)
               ELSE COALESCE(snap.market_cents, snap.low_cents)
          END IS NOT NULL
      AND (mpv.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, snap.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
}
