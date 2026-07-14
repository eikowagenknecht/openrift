import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add nullable color column with hex-color CHECK constraint (mirrors rarities/domains).
  await sql`
    ALTER TABLE languages
      ADD COLUMN color TEXT
        CONSTRAINT chk_languages_color CHECK (color ~ '^#[0-9a-fA-F]{6}$')
  `.execute(db);

  // Backfill the seeded languages with distinct, high-contrast hues so the
  // language chips are glanceable out of the box.
  await sql`
    UPDATE languages SET color = CASE code
      WHEN 'EN' THEN '#1D4ED8'
      WHEN 'FR' THEN '#7C3AED'
      WHEN 'ZH' THEN '#DC2626'
    END
    WHERE code IN ('EN','FR','ZH')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE languages DROP COLUMN color`.execute(db);
}
