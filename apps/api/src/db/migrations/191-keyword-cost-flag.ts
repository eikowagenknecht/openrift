import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Flag keywords whose glyph cost renders inside the keyword bracket.
 *
 * `[Equip :rb_energy_1:]`, `[Empower :rb_energy_2:]` — the cost is a parameter
 * of the keyword, so `fixTypography` keeps the glyphs inside the brackets for
 * these and pushes them back out for every other keyword. The set used to be
 * hardcoded (`Equip`, `Repeat`); this column moves it into data so admins can
 * flag new cost keywords (e.g. Empower) from the keyword admin page.
 *
 * The upsert guarantees the three known cost keywords have flagged rows even
 * if they had no style row before, so removing the hardcoded list does not
 * regress Equip/Repeat. Newly-inserted rows use the client-side fallback badge
 * color (`#6a6a6a`) so seeding does not change how the badge renders.
 *
 * @returns Resolves once the column exists and the known cost keywords are flagged.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE keywords
      ADD COLUMN cost_keyword boolean NOT NULL DEFAULT false;

    INSERT INTO keywords (name, color, cost_keyword)
    VALUES ('Equip', '#6a6a6a', true), ('Repeat', '#6a6a6a', true), ('Empower', '#6a6a6a', true)
    ON CONFLICT (name) DO UPDATE SET cost_keyword = true
  `.execute(db);
}

/** @returns Resolves once the column is dropped. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE keywords DROP COLUMN IF EXISTS cost_keyword
  `.execute(db);
}
