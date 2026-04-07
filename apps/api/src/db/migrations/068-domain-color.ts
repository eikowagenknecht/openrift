import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add nullable color column with hex-color CHECK constraint
  await sql`
    ALTER TABLE domains
      ADD COLUMN color TEXT
        CONSTRAINT chk_domains_color CHECK (color ~ '^#[0-9a-fA-F]{6}$')
  `.execute(db);

  // Backfill existing domains with the colors previously hardcoded in the frontend
  await sql`
    UPDATE domains SET color = CASE slug
      WHEN 'Fury'      THEN '#CB212D'
      WHEN 'Calm'      THEN '#16AA71'
      WHEN 'Mind'      THEN '#227799'
      WHEN 'Body'      THEN '#E2710C'
      WHEN 'Chaos'     THEN '#6B4891'
      WHEN 'Order'     THEN '#CDA902'
      WHEN 'Colorless' THEN '#737373'
    END
    WHERE slug IN ('Fury','Calm','Mind','Body','Chaos','Order','Colorless')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE domains DROP COLUMN color`.execute(db);
}
