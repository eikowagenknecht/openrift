import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Adds an orthogonal physical-size dimension to printings.
 *
 * Some cards exist in an "oversized" variety: physically larger but otherwise
 * identical art, finish, art-variant and language to their standard
 * counterpart. Size is therefore independent of `finish` (which changes how a
 * card *looks*) and of `art_variant`, so it gets its own reference table and a
 * `printings.size` column, mirroring how `finishes`/`art_variants` are modeled.
 *
 * `size` joins both printing-uniqueness constraints so an oversized printing
 * can coexist with its standard twin instead of colliding on the otherwise
 * identical (card_id, short_code, finish, marker_slugs, language) tuple.
 *
 * @returns Resolves once the table, column, constraints and view are in place.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Reference table + protection trigger ─────────────────────────────────
  await sql`
    CREATE TABLE card_sizes (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TRIGGER trg_card_sizes_protect_well_known
      BEFORE UPDATE OR DELETE ON card_sizes
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    INSERT INTO card_sizes (slug, label, sort_order, is_well_known) VALUES
      ('standard',  'Standard',  0, TRUE),
      ('oversized', 'Oversized', 1, TRUE)
  `.execute(db);

  // ── 2. Column on printings (existing rows backfill to 'standard') ───────────
  await sql`
    ALTER TABLE printings
      ADD COLUMN size TEXT NOT NULL DEFAULT 'standard';

    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_size FOREIGN KEY (size) REFERENCES card_sizes(slug)
  `.execute(db);

  // ── 3. Fold `size` into both uniqueness constraints ─────────────────────────
  // Re-create as DEFERRABLE INITIALLY DEFERRED, matching migration 092.
  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language, size)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language, size)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  // ── 4. Re-create printings_ordered so `size` is projected + ranked ──────────
  // The view selects an explicit column list (frozen at creation), so a plain
  // ADD COLUMN won't surface `size`. Drop + recreate with `p.*` and rank
  // standard before oversized (after finish) for a stable default order.
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           (row_number() OVER (
             ORDER BY
               l.sort_order,
               s.sort_order,
               p.short_code,
               array_length(p.marker_slugs, 1) IS NOT NULL,
               COALESCE(
                 (SELECT MIN(m.sort_order) FROM markers m
                  WHERE m.slug = ANY(p.marker_slugs)),
                 0
               ),
               f.sort_order,
               cs.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets       s  ON s.id   = p.set_id
    JOIN finishes   f  ON f.slug = p.finish
    JOIN card_sizes cs ON cs.slug = p.size
    JOIN languages  l  ON l.code = p.language
  `.execute(db);
}

/**
 * @returns Resolves once the size dimension is fully removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await sql`
    ALTER TABLE printings DROP CONSTRAINT fk_printings_size;
    ALTER TABLE printings DROP COLUMN size
  `.execute(db);

  await sql`DROP TABLE card_sizes`.execute(db);

  // Restore the original view (finish-last ordering).
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           (row_number() OVER (
             ORDER BY
               l.sort_order,
               s.sort_order,
               p.short_code,
               array_length(p.marker_slugs, 1) IS NOT NULL,
               COALESCE(
                 (SELECT MIN(m.sort_order) FROM markers m
                  WHERE m.slug = ANY(p.marker_slugs)),
                 0
               ),
               f.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets      s ON s.id   = p.set_id
    JOIN finishes  f ON f.slug = p.finish
    JOIN languages l ON l.code = p.language
  `.execute(db);
}
