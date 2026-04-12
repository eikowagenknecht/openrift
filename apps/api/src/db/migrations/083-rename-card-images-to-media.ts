import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Rename URL prefix from /card-images/ to /media/cards/ in all stored paths.
  await sql`
    UPDATE image_files
    SET rehosted_url = '/media/cards' || substring(rehosted_url from 13)
    WHERE rehosted_url LIKE '/card-images/%'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE image_files
    SET rehosted_url = '/card-images' || substring(rehosted_url from 13)
    WHERE rehosted_url LIKE '/media/cards/%'
  `.execute(db);
}
