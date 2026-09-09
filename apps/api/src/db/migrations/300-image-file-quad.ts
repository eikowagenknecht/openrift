import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE image_files
      ADD COLUMN quad jsonb,
      ADD CONSTRAINT chk_image_files_quad_shape
        CHECK (quad IS NULL OR jsonb_typeof(quad) = 'array')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE image_files DROP COLUMN quad`.execute(db);
}
