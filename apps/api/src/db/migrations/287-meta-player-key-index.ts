import type { Kysely } from "kysely";
import { sql } from "kysely";

/** The expression must stay character-for-character what `metaPlayerKey` computes. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX idx_meta_event_players_player_key
      ON meta_event_players ((regexp_replace(source_identity, '#\\d+$', '')))
      WHERE source_identity IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_meta_event_players_player_key`.execute(db);
}
