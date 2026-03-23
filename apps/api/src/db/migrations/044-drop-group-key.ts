import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_printing_sources_group_key`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_printing_sources_group_key ON printing_sources`.execute(db);
  await sql`DROP FUNCTION IF EXISTS printing_sources_set_group_key()`.execute(db);
  await sql`ALTER TABLE printing_sources DROP COLUMN IF EXISTS group_key`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE printing_sources ADD COLUMN group_key text NOT NULL DEFAULT ''
  `.execute(db);

  await sql`
    CREATE FUNCTION printing_sources_set_group_key() RETURNS trigger AS $$
    BEGIN
      NEW.group_key :=
        COALESCE(NEW.set_id, '') || '|' ||
        COALESCE(NEW.rarity, '') || '|' ||
        CASE
          WHEN NEW.finish IS NOT NULL THEN NEW.finish
          WHEN NEW.rarity IS NULL THEN ''
          WHEN NEW.rarity IN ('Common', 'Uncommon') THEN 'normal'
          ELSE 'foil'
        END || '|' ||
        COALESCE(NEW.promo_type_id::text, '') || '|' ||
        COALESCE(NEW.art_variant, 'normal') || '|' ||
        COALESCE(NEW.is_signed::text, 'false');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_printing_sources_group_key
      BEFORE INSERT OR UPDATE OF set_id, art_variant, is_signed, promo_type_id, rarity, finish
      ON printing_sources FOR EACH ROW
      EXECUTE FUNCTION printing_sources_set_group_key()
  `.execute(db);

  await sql`UPDATE printing_sources SET set_id = set_id`.execute(db);

  await sql`
    CREATE INDEX idx_printing_sources_group_key
      ON printing_sources (card_source_id, group_key)
  `.execute(db);
}
