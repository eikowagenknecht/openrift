import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * A readable permalink segment per printing, so a shared link can name the
 * printing instead of carrying a uuid. The short code alone is ambiguous:
 * `uq_printings_identity` allows the same code again under a different
 * language, finish, marker set or size.
 *
 * The trigger fills the slug only when the insert leaves it empty, and never
 * on update, so a printing keeps the slug it was published with even after
 * its code or language is corrected, and a later change to the shape below
 * leaves existing links alone.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE printings ADD COLUMN slug text`.execute(db);

  await sql`
    CREATE FUNCTION trg_printings_set_slug() RETURNS trigger AS $$
    DECLARE
      base text;
      candidate text;
      n int := 1;
    BEGIN
      IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
        RETURN NEW;
      END IF;
      base := trim(BOTH '-' FROM regexp_replace(
        lower(
          coalesce(NEW.language, '') || '-' ||
          coalesce(NEW.short_code, '') || '-' ||
          coalesce(NEW.finish, '') || '-' ||
          array_to_string(coalesce(NEW.marker_slugs, '{}'), '-') || '-' ||
          coalesce(NEW.size, '')
        ),
        '[^a-z0-9]+', '-', 'g'
      ));
      IF base = '' THEN
        base := 'printing';
      END IF;
      candidate := base;
      WHILE EXISTS (
        SELECT 1 FROM printings WHERE card_id = NEW.card_id AND slug = candidate
      ) LOOP
        n := n + 1;
        candidate := base || '-' || n;
      END LOOP;
      NEW.slug := candidate;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER printings_set_slug
    BEFORE INSERT ON printings
    FOR EACH ROW EXECUTE FUNCTION trg_printings_set_slug()
  `.execute(db);

  await sql`
    WITH computed AS (
      SELECT id,
             card_id,
             trim(BOTH '-' FROM regexp_replace(
               lower(
                 coalesce(language, '') || '-' ||
                 coalesce(short_code, '') || '-' ||
                 coalesce(finish, '') || '-' ||
                 array_to_string(coalesce(marker_slugs, '{}'), '-') || '-' ||
                 coalesce(size, '')
               ),
               '[^a-z0-9]+', '-', 'g'
             )) AS base
      FROM printings
    ),
    numbered AS (
      SELECT id,
             CASE WHEN base = '' THEN 'printing' ELSE base END AS base,
             row_number() OVER (
               PARTITION BY card_id, base ORDER BY id
             ) AS n
      FROM computed
    )
    UPDATE printings p
    SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
    FROM numbered n
    WHERE n.id = p.id
  `.execute(db);

  await sql`ALTER TABLE printings ALTER COLUMN slug SET NOT NULL`.execute(db);
  await sql`
    ALTER TABLE printings ADD CONSTRAINT chk_printings_slug_not_empty CHECK (slug <> '')
  `.execute(db);
  await sql`CREATE UNIQUE INDEX uq_printings_card_slug ON printings (card_id, slug)`.execute(db);

  // A view's column list is frozen at creation, so it must be recreated to
  // pick up the new column (migration 297 holds the prior body).
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
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`DROP TRIGGER printings_set_slug ON printings`.execute(db);
  await sql`DROP FUNCTION trg_printings_set_slug()`.execute(db);
  await sql`DROP INDEX uq_printings_card_slug`.execute(db);
  await sql`ALTER TABLE printings DROP CONSTRAINT chk_printings_slug_not_empty`.execute(db);
  await sql`ALTER TABLE printings DROP COLUMN slug`.execute(db);
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
