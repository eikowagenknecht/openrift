import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add nullable color column with hex-color CHECK constraint
  await sql`
    ALTER TABLE rarities
      ADD COLUMN color TEXT
        CONSTRAINT chk_rarities_color CHECK (color ~ '^#[0-9a-fA-F]{6}$')
  `.execute(db);

  // Backfill existing rarities with colors
  await sql`
    UPDATE rarities SET color = CASE slug
      WHEN 'Common'   THEN '#A6A6A6'
      WHEN 'Uncommon'  THEN '#47D1D1'
      WHEN 'Rare'      THEN '#E052B1'
      WHEN 'Epic'      THEN '#FA8938'
      WHEN 'Showcase'  THEN '#FFCC00'
    END
    WHERE slug IN ('Common','Uncommon','Rare','Epic','Showcase')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE rarities DROP COLUMN color`.execute(db);
}
