import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE site_settings (
      key        TEXT PRIMARY KEY CHECK (key <> ''),
      value      TEXT NOT NULL,
      scope      TEXT NOT NULL DEFAULT 'web' CHECK (scope IN ('web', 'api')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER site_settings_set_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS site_settings`.execute(db);
}
