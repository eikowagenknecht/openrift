import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE image_files
      ADD COLUMN rotation SMALLINT NOT NULL DEFAULT 0
        CONSTRAINT chk_image_files_rotation CHECK (rotation IN (0, 90, 180, 270))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE image_files DROP COLUMN rotation`.execute(db);
}
