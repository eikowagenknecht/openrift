import type { Kysely } from "kysely";
import { sql } from "kysely";

// Renames keyword_styles → keywords, adds is_well_known so WellKnown.keyword.UNIQUE
// passes the startup validator, and installs a protect-well-known trigger
// (custom function because keywords uses `name` as PK, not `slug`).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE keyword_styles RENAME TO keywords`.execute(db);

  await sql`
    ALTER TABLE keywords RENAME CONSTRAINT keyword_styles_color_check TO keywords_color_check;
    ALTER TABLE keywords RENAME CONSTRAINT keyword_styles_name_check TO keywords_name_check;
    ALTER INDEX keyword_styles_pkey RENAME TO keywords_pkey;
    ALTER TRIGGER keyword_styles_set_updated_at ON keywords RENAME TO keywords_set_updated_at;
  `.execute(db);

  await sql`
    ALTER TABLE keywords
      ADD COLUMN is_well_known BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);

  await sql`UPDATE keywords SET is_well_known = TRUE WHERE name = 'Unique'`.execute(db);

  await sql`
    CREATE FUNCTION protect_well_known_keyword() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known keyword "%"', OLD.name;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.name != OLD.name THEN
          RAISE EXCEPTION 'Cannot rename well-known keyword "%"', OLD.name;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known keyword "%"', OLD.name;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_keywords_protect_well_known
      BEFORE UPDATE OR DELETE ON keywords
      FOR EACH ROW EXECUTE FUNCTION protect_well_known_keyword();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE keywords DISABLE TRIGGER trg_keywords_protect_well_known`.execute(db);

  await sql`
    DROP TRIGGER trg_keywords_protect_well_known ON keywords;
    DROP FUNCTION protect_well_known_keyword();
  `.execute(db);

  await sql`ALTER TABLE keywords DROP COLUMN is_well_known`.execute(db);

  await sql`
    ALTER TRIGGER keywords_set_updated_at ON keywords RENAME TO keyword_styles_set_updated_at;
    ALTER INDEX keywords_pkey RENAME TO keyword_styles_pkey;
    ALTER TABLE keywords RENAME CONSTRAINT keywords_name_check TO keyword_styles_name_check;
    ALTER TABLE keywords RENAME CONSTRAINT keywords_color_check TO keyword_styles_color_check;
  `.execute(db);

  await sql`ALTER TABLE keywords RENAME TO keyword_styles`.execute(db);
}
