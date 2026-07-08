import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Per-section admin grants: gives a non-admin user access to a single admin
 * section (e.g. custom-tags) without full admin rights. Full admins keep
 * implicit access to everything via the `admins` table; this table only holds
 * the selective grants. `section` is a slug from the shared
 * `ADMIN_SECTIONS` registry, validated at the API layer (no FK target exists).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE admin_grants (
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, section)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE admin_grants`.execute(db);
}
