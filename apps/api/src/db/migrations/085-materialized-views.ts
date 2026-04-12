import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── mv_latest_printing_prices ───────────────────────────────────────────
  // Resolves the latest headline price per printing per marketplace.
  // Replaces a 4-way self-join + DISTINCT ON that ran on every page load.
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

  // Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  // ── mv_card_aggregates ──────────────────────────────────────────────────
  // Pre-computes domains[] and super_types[] per card so the catalog query
  // doesn't fire ~1200 scalar subqueries.
  await sql`
    CREATE MATERIALIZED VIEW mv_card_aggregates AS
    SELECT
      c.id AS card_id,
      COALESCE(
        (SELECT array_agg(cd.domain_slug ORDER BY cd.ordinal)
         FROM card_domains cd WHERE cd.card_id = c.id),
        '{}'
      ) AS domains,
      COALESCE(
        (SELECT array_agg(cst.super_type_slug)
         FROM card_super_types cst WHERE cst.card_id = c.id),
        '{}'
      ) AS super_types
    FROM cards c
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_card_aggregates_pk
      ON mv_card_aggregates (card_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_card_aggregates`.execute(db);
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);
}
