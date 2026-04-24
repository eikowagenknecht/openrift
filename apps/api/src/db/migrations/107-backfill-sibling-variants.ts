import type { Kysely } from "kysely";
import { sql } from "kysely";

// Make language-aggregate sibling fan-out explicit.
//
// Cardmarket's price guide (and TCGPlayer's, once it sells non-EN SKUs) is
// cross-language by construction — the product row stores language=NULL and
// the price covers every language of the same printing family. Historically
// `mv_latest_printing_prices` and `sourcesForPrinting` encoded this at read
// time with a `(mp.language IS NULL OR source.id = target.id)` clause plus a
// self-join on the "sibling" printing identity (same card/short_code/finish/
// art_variant/is_signed/marker_slugs).
//
// That was the only option before migration 102 made it legal to map one
// product to multiple printings. Now we can record each covered printing as
// its own variant row and drop the read-time magic entirely. This migration
// materializes the fan-out: for every variant on a language-NULL product,
// add variant rows for every sibling printing that doesn't already have one.
//
// No-op for language-non-null marketplaces (CT), where each language is a
// distinct SKU and fan-out was never applied.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO marketplace_product_variants (marketplace_product_id, printing_id)
    SELECT DISTINCT mpv.marketplace_product_id, sibling.id
    FROM marketplace_product_variants mpv
    JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
    JOIN printings source ON source.id = mpv.printing_id
    JOIN printings sibling
      ON sibling.card_id = source.card_id
      AND sibling.short_code = source.short_code
      AND sibling.finish = source.finish
      AND sibling.art_variant = source.art_variant
      AND sibling.is_signed = source.is_signed
      AND sibling.marker_slugs = source.marker_slugs
      AND sibling.id <> source.id
    WHERE mp.language IS NULL
    ON CONFLICT (marketplace_product_id, printing_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Best-effort rollback: remove variant rows that are pure backfill duplicates
  // — same (marketplace_product_id, sibling of some other variant's printing)
  // where the sibling has no snapshots of its own. Keeps anything with actual
  // recorded price history. The original variant row for each product (the
  // one the admin explicitly created pre-migration) isn't recoverable, so
  // this leaves all rows with snapshots intact, matching the spirit of a
  // non-destructive rollback.
  await sql`
    DELETE FROM marketplace_product_variants mpv
    USING marketplace_products mp
    WHERE mp.id = mpv.marketplace_product_id
      AND mp.language IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM marketplace_snapshots s WHERE s.variant_id = mpv.id
      )
      AND EXISTS (
        SELECT 1
        FROM marketplace_product_variants sibling_variant
        JOIN printings sibling ON sibling.id = sibling_variant.printing_id
        JOIN printings this_printing ON this_printing.id = mpv.printing_id
        WHERE sibling_variant.marketplace_product_id = mpv.marketplace_product_id
          AND sibling_variant.id <> mpv.id
          AND sibling.card_id = this_printing.card_id
          AND sibling.short_code = this_printing.short_code
          AND sibling.finish = this_printing.finish
          AND sibling.art_variant = this_printing.art_variant
          AND sibling.is_signed = this_printing.is_signed
          AND sibling.marker_slugs = this_printing.marker_slugs
      )
  `.execute(db);
}
