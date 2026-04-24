import type { Kysely } from "kysely";
import { sql } from "kysely";

// After migration 104 moved the SKU axes (finish, language) up to
// marketplace_products, the matching columns on marketplace_product_variants
// and marketplace_ignored_variants are redundant — every variant's SKU is
// already uniquely identified by its product row. Dropping them makes the
// data model honest: a variant is a pure (product, printing) bridge.
//
// This migration:
//   1. Drops mv_latest_printing_prices (depends on mpv.language).
//   2. Drops mpv.finish, mpv.language and swaps the variant unique constraint
//      to (marketplace_product_id, printing_id).
//   3. Drops miv.finish, miv.language and swaps the ignored_variants primary
//      key to (marketplace_product_id).
//   4. Recreates mv_latest_printing_prices using mp.language for the
//      language-aggregate sibling fan-out.

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Drop the materialized view — it reads mpv.language.
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  // 2. Variants: drop old unique, drop columns, add the bridge unique.
  await sql`DROP INDEX marketplace_product_variants_product_finish_language_key`.execute(db);
  await sql`
    ALTER TABLE marketplace_product_variants
      DROP COLUMN finish,
      DROP COLUMN language
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_product_variants_product_printing_key
      ON marketplace_product_variants (marketplace_product_id, printing_id)
  `.execute(db);

  // 3. Ignored variants: drop pkey and SKU columns, add bridge pkey.
  await sql`
    ALTER TABLE marketplace_ignored_variants
      DROP CONSTRAINT marketplace_ignored_variants_pkey
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_ignored_variants
      DROP COLUMN finish,
      DROP COLUMN language
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_ignored_variants
      ADD CONSTRAINT marketplace_ignored_variants_pkey PRIMARY KEY (marketplace_product_id)
  `.execute(db);

  // 4. Recreate mv_latest_printing_prices. The only substantive change is
  //    `mpv.language IS NULL` → `mp.language IS NULL`: the language-aggregate
  //    sibling fan-out now lives at the product-row level.
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
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop the materialized view so we can add mpv.language back.
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  // Put (finish, language) columns back on variants and backfill from the
  // product row. Finish was NOT NULL originally; language was nullable since
  // migration 081.
  await sql`
    ALTER TABLE marketplace_product_variants
      ADD COLUMN finish text,
      ADD COLUMN language text
  `.execute(db);
  await sql`
    UPDATE marketplace_product_variants mpv
    SET finish = mp.finish, language = mp.language
    FROM marketplace_products mp
    WHERE mp.id = mpv.marketplace_product_id
  `.execute(db);
  await sql`ALTER TABLE marketplace_product_variants ALTER COLUMN finish SET NOT NULL`.execute(db);

  await sql`DROP INDEX marketplace_product_variants_product_printing_key`.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_product_variants_product_finish_language_key
      ON marketplace_product_variants (marketplace_product_id, finish, language, printing_id)
      NULLS NOT DISTINCT
  `.execute(db);

  // Same for ignored_variants — put columns back, backfill, restore old PK.
  await sql`
    ALTER TABLE marketplace_ignored_variants
      ADD COLUMN finish text,
      ADD COLUMN language text DEFAULT 'EN'
  `.execute(db);
  await sql`
    UPDATE marketplace_ignored_variants miv
    SET finish = mp.finish, language = COALESCE(mp.language, 'EN')
    FROM marketplace_products mp
    WHERE mp.id = miv.marketplace_product_id
  `.execute(db);
  await sql`ALTER TABLE marketplace_ignored_variants ALTER COLUMN finish SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_ignored_variants ALTER COLUMN language SET NOT NULL`.execute(
    db,
  );

  await sql`
    ALTER TABLE marketplace_ignored_variants
      DROP CONSTRAINT marketplace_ignored_variants_pkey
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_ignored_variants
      ADD CONSTRAINT marketplace_ignored_variants_pkey
      PRIMARY KEY (marketplace_product_id, finish, language)
  `.execute(db);

  // Recreate the materialized view with the pre-105 definition
  // (mpv.language IS NULL instead of mp.language IS NULL).
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
      AND (mpv.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, (snap.zero_low_cents IS NULL), snap.recorded_at DESC
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
}
