import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Image credit belongs to the file, not the printing: two people can
 * photograph one promo, and a printing-level citation credited whichever name
 * it happened to hold.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE image_files
      ADD COLUMN credit text,
      ADD CONSTRAINT chk_image_files_credit CHECK (credit <> '')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE image_files
      DROP CONSTRAINT chk_image_files_credit,
      DROP COLUMN credit
  `.execute(db);
}
