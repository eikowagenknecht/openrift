import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add composite unique constraint on printings (replaces slug as the idempotency key).
  //    NULLS NOT DISTINCT treats NULL promo_type_id values as equal for uniqueness.
  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT uq_printings_identity
    UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, promo_type_id)
  `.execute(db);

  // 2. Migrate printing_link_overrides from printing_slug to printing_id (UUID FK).
  await sql`ALTER TABLE printing_link_overrides ADD COLUMN printing_id uuid`.execute(db);

  // Populate printing_id from the current slug reference
  await sql`
    UPDATE printing_link_overrides plo
    SET printing_id = p.id
    FROM printings p
    WHERE p.slug = plo.printing_slug
  `.execute(db);

  // Delete any orphaned overrides that couldn't be resolved
  await sql`DELETE FROM printing_link_overrides WHERE printing_id IS NULL`.execute(db);

  // Make printing_id NOT NULL and add FK
  await sql`ALTER TABLE printing_link_overrides ALTER COLUMN printing_id SET NOT NULL`.execute(db);
  await sql`
    ALTER TABLE printing_link_overrides
    ADD CONSTRAINT fk_plo_printing_id FOREIGN KEY (printing_id)
    REFERENCES printings(id) ON DELETE CASCADE
  `.execute(db);

  // Drop old printing_slug column and its constraint
  await sql`ALTER TABLE printing_link_overrides DROP COLUMN printing_slug`.execute(db);

  // 3. Drop slug column from printings.
  // First drop unique constraint/index on slug (if any)
  await sql`DROP INDEX IF EXISTS idx_printings_slug`.execute(db);
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS printings_slug_key`.execute(db);
  // Drop the check constraint
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_slug_not_empty`.execute(
    db,
  );
  // Drop the column
  await sql`ALTER TABLE printings DROP COLUMN slug`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add slug column
  await sql`ALTER TABLE printings ADD COLUMN slug text`.execute(db);

  // Rebuild slug values from component fields
  await sql`
    UPDATE printings p
    SET slug = p.short_code || ':' || p.finish || ':' || COALESCE(pt.slug, '')
    FROM promo_types pt
    WHERE p.promo_type_id = pt.id
  `.execute(db);
  // Fallback for printings without promo type (or any remaining NULLs)
  await sql`
    UPDATE printings
    SET slug = short_code || ':' || finish || ':'
    WHERE slug IS NULL
  `.execute(db);

  await sql`ALTER TABLE printings ALTER COLUMN slug SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printings ADD CONSTRAINT printings_slug_key UNIQUE (slug)`.execute(db);
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_slug_not_empty CHECK (slug <> '')`.execute(
    db,
  );

  // Re-add printing_slug to printing_link_overrides
  await sql`ALTER TABLE printing_link_overrides ADD COLUMN printing_slug text`.execute(db);
  await sql`
    UPDATE printing_link_overrides plo
    SET printing_slug = p.short_code || ':' || p.finish || ':' || COALESCE(pt.slug, '')
    FROM printings p
    LEFT JOIN promo_types pt ON pt.id = p.promo_type_id
    WHERE p.id = plo.printing_id
  `.execute(db);
  await sql`ALTER TABLE printing_link_overrides ALTER COLUMN printing_slug SET NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE printing_link_overrides ADD CONSTRAINT chk_plo_no_empty_printing_slug CHECK (printing_slug <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_link_overrides DROP CONSTRAINT IF EXISTS fk_plo_printing_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_link_overrides DROP COLUMN printing_id`.execute(db);

  // Drop composite unique constraint
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS uq_printings_identity`.execute(db);
}
