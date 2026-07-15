import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Bring `languages` in line with the other reference tables: an `is_well_known`
 * flag plus the guard trigger that stops a well-known row being renamed,
 * deleted, or unflagged from the admin UI.
 *
 * `languages` was the one reference table the application special-cases without
 * this protection. `EN` in particular is load-bearing — printings default to it,
 * canonical-printing selection ranks it first, and the language-agnostic
 * Cardmarket / TCGplayer price feeds are bound to it — so deleting it from
 * `/admin/languages` would break the catalog with no warning. `SC` is
 * special-cased at the CardTrader and Cardmarket boundaries.
 *
 * Must run after `204-language-zh-to-sc`: the trigger rejects renames of a
 * flagged row, so the SC rename has to be settled before the flag goes on.
 *
 * The existing `protect_well_known()` reads `NEW.slug` and its keyword twin
 * reads `NEW.name`; `languages` is keyed on `code`, hence a third function.
 * Other languages stay unflagged and fully editable.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE languages
      ADD COLUMN is_well_known BOOLEAN NOT NULL DEFAULT false
  `.execute(db);

  await sql`UPDATE languages SET is_well_known = true WHERE code IN ('EN', 'SC')`.execute(db);

  await sql`
    CREATE FUNCTION protect_well_known_language() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known language "%"', OLD.code;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.code != OLD.code THEN
          RAISE EXCEPTION 'Cannot rename well-known language "%"', OLD.code;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known language "%"', OLD.code;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_languages_protect_well_known
      BEFORE DELETE OR UPDATE ON languages
      FOR EACH ROW EXECUTE FUNCTION protect_well_known_language()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER trg_languages_protect_well_known ON languages`.execute(db);
  await sql`DROP FUNCTION protect_well_known_language()`.execute(db);
  await sql`ALTER TABLE languages DROP COLUMN is_well_known`.execute(db);
}
