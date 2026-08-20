import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Lets an admin override the substitute artwork shown for a printing that has
 * no scan of its own.
 *
 * Until now the substitute was always derived: `findStandardArtFallback` picks
 * the card's standard printing in the same language (else EN). That is right
 * most of the time and wrong in two ways it cannot detect — an alt-art printing
 * whose illustration is shared with another *non*-standard printing gets the
 * basic art, and a card whose only scanned sibling is non-standard gets nothing
 * at all. Neither is expressible as a rule over the existing columns, so the
 * override is data.
 *
 * `fallback_art_mode` carries the three states and `fallback_image_file_id` the
 * pinned file:
 *
 * - `auto` — derive as before (the default, and what nearly every row keeps).
 * - `pinned` — show `fallback_image_file_id`, whatever the derivation says.
 * - `none` — show no substitute at all, only the drawn placeholder. For a
 *   printing whose art no other printing represents, where borrowed art would
 *   misinform rather than help.
 *
 * The pin points at `image_files` rather than at another printing, so art that
 * exists nowhere in the catalogue (a hand-made composite, an external source)
 * can be pinned too. The cost is that the pinned file carries no printing
 * identity for `FallbackArtBadges` to diff against; the web resolver recovers
 * one when the file happens to be a sibling printing's scan, and degrades to a
 * generic marker when it does not.
 *
 * Note what this does *not* do: a pinned printing still has no `printing_images`
 * row, so it still counts as missing a scan everywhere it did before — the
 * missing-images report, the contribute prompt, the scanner's training set. The
 * override changes what is displayed, never what we claim to have.
 *
 * @returns Resolves once the columns, constraints, index and view are in place.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE printings
      ADD COLUMN fallback_art_mode TEXT NOT NULL DEFAULT 'auto',
      ADD COLUMN fallback_image_file_id UUID
  `.execute(db);

  // RESTRICT rather than SET NULL: SET NULL would leave mode='pinned' with no
  // file and trip the pairing CHECK anyway, so the delete fails either way.
  // Failing on the FK says which row blocks it. Callers that legitimately
  // delete a pinned file (the orphan sweep) exclude it by checking
  // `isImageFileReferenced`, which counts pins as references.
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_fallback_image_file
      FOREIGN KEY (fallback_image_file_id) REFERENCES image_files(id) ON DELETE RESTRICT
  `.execute(db);

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT chk_printings_fallback_art_mode
        CHECK (fallback_art_mode IN ('auto', 'pinned', 'none')),
      ADD CONSTRAINT chk_printings_fallback_pinned_has_image
        CHECK ((fallback_art_mode = 'pinned') = (fallback_image_file_id IS NOT NULL))
  `.execute(db);

  // Partial: the column is NULL on all but a handful of rows, and the NULLs are
  // never looked up. Serves both the FK's delete-time check and the
  // pin-as-reference test in `isImageFileReferenced`.
  await sql`
    CREATE INDEX idx_printings_fallback_image_file
      ON printings (fallback_image_file_id)
      WHERE fallback_image_file_id IS NOT NULL
  `.execute(db);

  // `printings_ordered` is `SELECT p.*`, but PostgreSQL freezes the column list
  // at creation, so the new columns need the view recreated to surface (same
  // reason migration 180 recreated it for `size`).
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}

/**
 * @returns Resolves once the override columns are gone and the view is back.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`
    ALTER TABLE printings
      DROP CONSTRAINT chk_printings_fallback_pinned_has_image,
      DROP CONSTRAINT chk_printings_fallback_art_mode,
      DROP CONSTRAINT fk_printings_fallback_image_file
  `.execute(db);
  await sql`DROP INDEX IF EXISTS idx_printings_fallback_image_file`.execute(db);
  await sql`
    ALTER TABLE printings
      DROP COLUMN fallback_image_file_id,
      DROP COLUMN fallback_art_mode
  `.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}
