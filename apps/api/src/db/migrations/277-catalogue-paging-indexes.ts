import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The catalogue triage list's default ordering, as an index. Neither table's
 * existing start index carries the tiebreak or the nulls ordering, so one page
 * sorted every mirror row with all of its columns in tow, and spilled to disk.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX idx_uvsgames_events_page
      ON uvsgames_events (start_at DESC NULLS LAST, external_id DESC)
  `.execute(db);

  await sql`
    CREATE INDEX idx_playloltcg_events_page
      ON playloltcg_events (start_at DESC NULLS LAST, activity_shop_id DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_playloltcg_events_page`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_uvsgames_events_page`.execute(db);
}
