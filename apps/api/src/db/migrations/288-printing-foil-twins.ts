import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Carry "this non-foil printing also exists in foil" on every printing row.
 *
 * `isStandardPrinting` needs it to tell two non-foil rares apart: an OGS
 * starter-deck rare is the only version of its card and is the standard
 * printing, while OGN-191's non-foil is the unfoiled duplicate of a foil pack
 * card and is not. Nothing on a printing row distinguishes them — the answer
 * lives in a sibling — so it is materialized here rather than resolved per
 * caller, which would make the verdict depend on whichever subset of the
 * catalog the caller happened to hold.
 *
 * A twin is a printing identical on every identity column
 * (`uq_printings_identity` plus the variant columns) except its finish. Foil
 * rows are skipped: two foils cannot share an identity, so their answer is
 * always false.
 *
 * Staleness follows `mv_printings_canonical_rank`: a missing row reads as
 * "no twin", which is the verdict the rule gave before this view existed.
 * @returns Resolves once the materialized view and the rewritten view exist.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE MATERIALIZED VIEW mv_printing_foil_twins AS
    SELECT p.id AS printing_id
    FROM printings p
    WHERE p.finish <> 'foil'
      AND EXISTS (
        SELECT 1 FROM printings q
        WHERE q.card_id         = p.card_id
          AND q.short_code      = p.short_code
          AND q.language        = p.language
          AND q.size            = p.size
          AND q.art_variant     = p.art_variant
          AND q.is_signed       = p.is_signed
          AND q.is_overnumbered = p.is_overnumbered
          AND q.marker_slugs    = p.marker_slugs
          AND q.finish          = 'foil'
      )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_printing_foil_twins_pk
      ON mv_printing_foil_twins (printing_id)
  `.execute(db);

  await sql`DROP VIEW printings_ordered`.execute(db);

  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank,
           (t.printing_id IS NOT NULL) AS has_foil_twin
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
    LEFT JOIN mv_printing_foil_twins      t ON t.printing_id = p.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_printing_foil_twins`.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}
