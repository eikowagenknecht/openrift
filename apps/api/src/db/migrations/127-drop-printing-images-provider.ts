import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE printing_images
      DROP COLUMN provider
  `.execute(db);
  await sql`
    CREATE INDEX idx_printing_images_printing_face
      ON printing_images (printing_id, face)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_printing_images_printing_face`.execute(db);
  await sql`
    ALTER TABLE printing_images
      ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown'
  `.execute(db);
  await sql`
    ALTER TABLE printing_images
      ADD CONSTRAINT chk_printing_images_provider_not_empty
        CHECK (provider <> '')
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_printing_images_provider
      ON printing_images (printing_id, face, provider)
  `.execute(db);
}
