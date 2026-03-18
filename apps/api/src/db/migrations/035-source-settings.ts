import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE source_settings (
      source text NOT NULL PRIMARY KEY CHECK (source <> ''),
      sort_order int NOT NULL DEFAULT 0,
      is_hidden boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // Seed with all distinct source names, alphabetically ordered
  await sql`
    INSERT INTO source_settings (source, sort_order)
    SELECT source, (ROW_NUMBER() OVER (ORDER BY source))::int
    FROM (SELECT DISTINCT source FROM card_sources) AS s
    ON CONFLICT DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE source_settings`.execute(db);
}
