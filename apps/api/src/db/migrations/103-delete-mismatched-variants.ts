import type { Kysely } from "kysely";
import { sql } from "kysely";

// Delete variants whose (finish, language) points to an SKU that doesn't
// exist in staging, *but* only when staging has at least one other SKU for
// the same (marketplace, external_id). These rows were saved before the
// save-time validation was tightened — the variant stores the printing's
// finish/language rather than the marketplace's actual SKU identity, so the
// UI shows "normal" but the marketplace only ships "foil" for this product.
//
// Category-B orphans (variants where staging has rotated out entirely) are
// preserved: the following migration rebuilds marketplace_products from the
// variant itself as a fallback when staging is empty.
//
// Detection is dynamic — no hardcoded IDs — so dev and prod each delete
// whatever's genuinely inconsistent on their own databases.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Snapshots FK the variant without ON DELETE CASCADE, so we drop them first.
  // These snapshots captured prices for the wrong SKU tuple anyway (e.g. foil
  // prices stored against a "normal" variant), so there's nothing worth
  // preserving.
  await sql`
    WITH doomed AS (
      SELECT mpv.id
      FROM marketplace_product_variants mpv
      JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
      WHERE EXISTS (
          SELECT 1 FROM marketplace_staging s
          WHERE s.marketplace = mp.marketplace
            AND s.external_id = mp.external_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM marketplace_staging s
          WHERE s.marketplace = mp.marketplace
            AND s.external_id = mp.external_id
            AND s.finish = mpv.finish
            AND (
              mp.marketplace IN ('cardmarket', 'tcgplayer')
              OR s.language = COALESCE(mpv.language, 'EN')
            )
        )
    )
    DELETE FROM marketplace_snapshots
    WHERE variant_id IN (SELECT id FROM doomed)
  `.execute(db);

  await sql`
    DELETE FROM marketplace_product_variants mpv
    USING marketplace_products mp
    WHERE mp.id = mpv.marketplace_product_id
      AND EXISTS (
        SELECT 1 FROM marketplace_staging s
        WHERE s.marketplace = mp.marketplace
          AND s.external_id = mp.external_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM marketplace_staging s
        WHERE s.marketplace = mp.marketplace
          AND s.external_id = mp.external_id
          AND s.finish = mpv.finish
          AND (
            mp.marketplace IN ('cardmarket', 'tcgplayer')
            OR s.language = COALESCE(mpv.language, 'EN')
          )
      )
  `.execute(db);
}

// oxlint-disable-next-line no-empty-function -- destructive migration, no meaningful down.
export async function down(_db: Kysely<unknown>): Promise<void> {}
