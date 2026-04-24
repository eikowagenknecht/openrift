import type { Kysely } from "kysely";
import { sql } from "kysely";

// Normalize marketplace_products to one row per SKU: (marketplace, external_id,
// finish, language). Before this migration, marketplace_products carried only
// (marketplace, external_id) and the SKU axes lived on marketplace_staging and
// on marketplace_product_variants. That split meant a variant's (finish,
// language) had to be inferred from the printing at save time, which leaked
// printing identity into marketplace identity and caused the "table shows
// normal but save-path says foil" class of bugs.
//
// In the new model, the product row *is* the SKU. Variants become a pure
// (product, printing) bridge table — no duplicated SKU axes. Cardmarket and
// TCGPlayer, which don't expose language as a SKU dimension, get
// `language = NULL` (using NULLS NOT DISTINCT so the unique index still
// dedupes correctly).
//
// This migration:
//   1. Adds nullable finish/language columns to marketplace_products.
//   2. Backfills one row per distinct SKU — sourced from staging when
//      available, otherwise from existing variants (preserves "staging
//      rotated out" mappings).
//   3. Repoints marketplace_product_variants.marketplace_product_id and
//      marketplace_ignored_variants.marketplace_product_id to the matching
//      per-SKU row.
//   4. Deletes the now-unused parent rows (finish still NULL), swaps the
//      unique constraint, and makes finish NOT NULL.
//
// The subsequent migration drops variant.finish / variant.language entirely.

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add nullable SKU columns. finish NOT NULL is applied at the end,
  //    after every row has been backfilled.
  await sql`
    ALTER TABLE marketplace_products
      ADD COLUMN finish text,
      ADD COLUMN language text
  `.execute(db);

  // 1a. Drop the old (marketplace, external_id) unique so we can insert
  //     multiple per-SKU rows for the same pair before cleaning up the
  //     finish-NULL parent rows. The new NULLS NOT DISTINCT unique is added
  //     at the end of the migration.
  await sql`
    ALTER TABLE marketplace_products
      DROP CONSTRAINT marketplace_products_marketplace_external_id_key
  `.execute(db);

  // 2. Backfill one per-SKU row for every distinct SKU seen in staging, for
  //    each existing (marketplace, external_id) parent. Cardmarket and
  //    TCGPlayer ingesters still write language='EN' today (migration 106
  //    switches them to NULL), so we normalize here.
  await sql`
    INSERT INTO marketplace_products (marketplace, external_id, group_id, product_name, finish, language)
    SELECT DISTINCT
      mp.marketplace,
      mp.external_id,
      mp.group_id,
      mp.product_name,
      s.finish,
      CASE WHEN mp.marketplace IN ('cardmarket', 'tcgplayer') THEN NULL ELSE s.language END
    FROM marketplace_products mp
    JOIN marketplace_staging s
      ON s.marketplace = mp.marketplace
      AND s.external_id = mp.external_id
    WHERE mp.finish IS NULL
  `.execute(db);

  // 3. Category B fallback: preserve variant mappings when staging has rotated
  //    out entirely. For each (marketplace, external_id) with no staging rows
  //    at all, derive SKU rows from the still-valid variant's (finish, language)
  //    — CM/TCG language normalized to NULL.
  await sql`
    INSERT INTO marketplace_products (marketplace, external_id, group_id, product_name, finish, language)
    SELECT DISTINCT
      mp.marketplace,
      mp.external_id,
      mp.group_id,
      mp.product_name,
      mpv.finish,
      CASE WHEN mp.marketplace IN ('cardmarket', 'tcgplayer') THEN NULL ELSE mpv.language END
    FROM marketplace_products mp
    JOIN marketplace_product_variants mpv ON mpv.marketplace_product_id = mp.id
    WHERE mp.finish IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM marketplace_staging s
        WHERE s.marketplace = mp.marketplace
          AND s.external_id = mp.external_id
      )
  `.execute(db);

  // 4. Repoint variants at the new per-SKU rows. For CM/TCG the variant's
  //    language is irrelevant (the new product row stores NULL); for CT we
  //    match the variant's stored language. The join between old_mp / new_mp
  //    is expressed through the WHERE clause — Postgres disallows referring
  //    to the UPDATE target table from inside a FROM-clause JOIN's ON.
  await sql`
    UPDATE marketplace_product_variants mpv
    SET marketplace_product_id = new_mp.id
    FROM marketplace_products old_mp, marketplace_products new_mp
    WHERE mpv.marketplace_product_id = old_mp.id
      AND old_mp.finish IS NULL
      AND new_mp.marketplace = old_mp.marketplace
      AND new_mp.external_id = old_mp.external_id
      AND new_mp.finish IS NOT NULL
      AND new_mp.finish = mpv.finish
      AND (
        old_mp.marketplace IN ('cardmarket', 'tcgplayer') AND new_mp.language IS NULL
        OR
        old_mp.marketplace NOT IN ('cardmarket', 'tcgplayer')
          AND new_mp.language IS NOT DISTINCT FROM mpv.language
      )
  `.execute(db);

  // 5. Same repoint for ignored_variants.
  await sql`
    UPDATE marketplace_ignored_variants miv
    SET marketplace_product_id = new_mp.id
    FROM marketplace_products old_mp, marketplace_products new_mp
    WHERE miv.marketplace_product_id = old_mp.id
      AND old_mp.finish IS NULL
      AND new_mp.marketplace = old_mp.marketplace
      AND new_mp.external_id = old_mp.external_id
      AND new_mp.finish IS NOT NULL
      AND new_mp.finish = miv.finish
      AND (
        old_mp.marketplace IN ('cardmarket', 'tcgplayer') AND new_mp.language IS NULL
        OR
        old_mp.marketplace NOT IN ('cardmarket', 'tcgplayer')
          AND new_mp.language IS NOT DISTINCT FROM miv.language
      )
  `.execute(db);

  // 6. Safety: if any variant or ignored_variant is still pointed at an old
  //    (finish-NULL) product row, the repoint failed — fail the migration
  //    loudly rather than silently orphaning data.
  const orphanedVariants = await sql<{
    count: string;
  }>`
    SELECT COUNT(*)::text AS count
    FROM marketplace_product_variants mpv
    JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
    WHERE mp.finish IS NULL
  `.execute(db);
  if (orphanedVariants.rows[0] !== undefined && orphanedVariants.rows[0].count !== "0") {
    throw new Error(
      `Migration 104: ${orphanedVariants.rows[0].count} variant row(s) could not be repointed to a per-SKU product. Run migration 103 first to delete Category A mismatches.`,
    );
  }
  const orphanedIgnored = await sql<{
    count: string;
  }>`
    SELECT COUNT(*)::text AS count
    FROM marketplace_ignored_variants miv
    JOIN marketplace_products mp ON mp.id = miv.marketplace_product_id
    WHERE mp.finish IS NULL
  `.execute(db);
  if (orphanedIgnored.rows[0] !== undefined && orphanedIgnored.rows[0].count !== "0") {
    throw new Error(
      `Migration 104: ${orphanedIgnored.rows[0].count} ignored_variant row(s) could not be repointed to a per-SKU product.`,
    );
  }

  // 7. Delete the now-unused parent rows.
  await sql`DELETE FROM marketplace_products WHERE finish IS NULL`.execute(db);

  // 8. Finalize constraints. The (marketplace, external_id) unique was
  //    dropped at the start; now add the per-SKU unique (NULLS NOT DISTINCT
  //    so CM/TCG can share NULL language) and make finish NOT NULL.
  await sql`
    ALTER TABLE marketplace_products
      ALTER COLUMN finish SET NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_products_sku_key
      ON marketplace_products (marketplace, external_id, finish, language)
      NULLS NOT DISTINCT
  `.execute(db);
}

export function down(_db: Kysely<unknown>): Promise<void> {
  throw new Error("Migration 104 is not reversible — data would be conflated across SKU rows.");
}
