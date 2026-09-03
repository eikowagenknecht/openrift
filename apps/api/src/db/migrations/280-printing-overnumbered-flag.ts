import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Moves "overnumbered" off `art_variant` onto its own boolean, alongside
 * `is_signed`. The enum could record only one of alt-art or overnumbered, but
 * Riot has since printed cards that are both. Deriving the flag from
 * `printed_total` was rejected: it lives on `sets`, is nullable, and rune
 * codes never carry one at all.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE printings
      ADD COLUMN is_overnumbered BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);

  await sql`
    UPDATE printings SET is_overnumbered = TRUE WHERE art_variant = 'overnumbered'
  `.execute(db);

  await sql`
    UPDATE printings p
    SET is_overnumbered = TRUE
    FROM sets s
    WHERE s.id = p.set_id
      AND s.printed_total IS NOT NULL
      AND (regexp_match(p.short_code, '^[A-Z0-9]+-([0-9]+)'))[1] IS NOT NULL
      AND ((regexp_match(p.short_code, '^[A-Z0-9]+-([0-9]+)'))[1])::int > s.printed_total
  `.execute(db);

  await sql`
    UPDATE printings SET art_variant = 'normal' WHERE art_variant = 'overnumbered'
  `.execute(db);

  // Candidates carry the flag too, so a contribution can state it and the
  // accept flow has a value to copy.
  await sql`ALTER TABLE candidate_printings ADD COLUMN is_overnumbered BOOLEAN`.execute(db);
  await sql`
    UPDATE candidate_printings
    SET is_overnumbered = TRUE, art_variant = 'normal'
    WHERE art_variant = 'overnumbered'
  `.execute(db);

  // Dynamic list rules store CardFilters as jsonb; a rule naming `overnumbered`
  // would go inert once the slug is gone, silently widening an exclude.
  // Rewrite the two unambiguous shapes onto the flag; a mixed include is an OR
  // the flag can't express, so it only drops the dead slug.
  await sql`
    UPDATE lists l
    SET rules = (
      SELECT jsonb_agg(rewritten ORDER BY r.ord)
      FROM jsonb_array_elements(l.rules) WITH ORDINALITY AS r(rule, ord),
      LATERAL (
        SELECT r.rule->'filter' AS f
      ) AS cur,
      LATERAL (
        SELECT
          COALESCE(
            (SELECT jsonb_agg(e) FROM jsonb_array_elements(cur.f->'artVariants') e
             WHERE e <> '"overnumbered"'::jsonb),
            '[]'::jsonb
          ) AS inc,
          COALESCE(
            (SELECT jsonb_agg(e) FROM jsonb_array_elements(cur.f->'artVariantsExclude') e
             WHERE e <> '"overnumbered"'::jsonb),
            '[]'::jsonb
          ) AS exc
      ) AS stripped,
      LATERAL (
        SELECT CASE
          WHEN cur.f->'artVariantsExclude' @> '["overnumbered"]'::jsonb THEN 'false'::jsonb
          WHEN cur.f->'artVariants' @> '["overnumbered"]'::jsonb
            AND jsonb_array_length(cur.f->'artVariants') = 1 THEN 'true'::jsonb
          ELSE COALESCE(cur.f->'isOvernumbered', 'null'::jsonb)
        END AS flag
      ) AS resolved,
      LATERAL (
        SELECT jsonb_set(
          r.rule,
          '{filter}',
          cur.f
            || jsonb_build_object('artVariants', stripped.inc)
            || jsonb_build_object('artVariantsExclude', stripped.exc)
            || jsonb_build_object('isOvernumbered', resolved.flag)
        ) AS rewritten
      ) AS out
    )
    WHERE l.rules::text LIKE '%overnumbered%'
  `.execute(db);

  await sql`ALTER TABLE art_variants DISABLE TRIGGER trg_art_variants_protect_well_known`.execute(
    db,
  );
  await sql`DELETE FROM art_variants WHERE slug = 'overnumbered'`.execute(db);
  await sql`ALTER TABLE art_variants ENABLE TRIGGER trg_art_variants_protect_well_known`.execute(
    db,
  );

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, is_overnumbered, marker_slugs, rarity, finish, language, size)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  // `printings_ordered` was created as `SELECT p.*`, but PostgreSQL freezes the
  // column list at creation, so the new column needs the view recreated.
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW printings_ordered`.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language, size)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await sql`
    INSERT INTO art_variants (slug, label, sort_order, is_well_known)
    VALUES ('overnumbered', 'Overnumbered', 2, TRUE)
    ON CONFLICT (slug) DO NOTHING
  `.execute(db);

  // Ultimates keep their art variant on the way back, exactly as they had it.
  await sql`
    UPDATE printings
    SET art_variant = 'overnumbered'
    WHERE is_overnumbered AND art_variant = 'normal'
  `.execute(db);

  // False folds into excludes, true into includes. A stripped-only rule can't
  // be distinguished from one that never named the slug, so it stays as-is.
  await sql`
    UPDATE lists l
    SET rules = (
      SELECT jsonb_agg(rewritten ORDER BY r.ord)
      FROM jsonb_array_elements(l.rules) WITH ORDINALITY AS r(rule, ord),
      LATERAL (
        SELECT r.rule->'filter' AS f
      ) AS cur,
      LATERAL (
        SELECT jsonb_set(
          r.rule,
          '{filter}',
          (cur.f - 'isOvernumbered')
            || CASE
              WHEN cur.f->'isOvernumbered' = 'false'::jsonb
                THEN jsonb_build_object(
                  'artVariantsExclude',
                  COALESCE(cur.f->'artVariantsExclude', '[]'::jsonb) || '["overnumbered"]'::jsonb
                )
              WHEN cur.f->'isOvernumbered' = 'true'::jsonb
                THEN jsonb_build_object(
                  'artVariants',
                  COALESCE(cur.f->'artVariants', '[]'::jsonb) || '["overnumbered"]'::jsonb
                )
              ELSE '{}'::jsonb
            END
        ) AS rewritten
      ) AS out
    )
    WHERE l.rules::text LIKE '%isOvernumbered%'
  `.execute(db);

  await sql`
    UPDATE candidate_printings
    SET art_variant = 'overnumbered'
    WHERE is_overnumbered AND art_variant = 'normal'
  `.execute(db);
  await sql`ALTER TABLE candidate_printings DROP COLUMN is_overnumbered`.execute(db);
  await sql`ALTER TABLE printings DROP COLUMN is_overnumbered`.execute(db);

  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}
