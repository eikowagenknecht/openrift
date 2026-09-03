import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Records which overlay minted a standings row, so a promote can delete the
 * row once that overlay stops claiming it. Hand-entered rows are
 * indistinguishable from minted ones by their other columns.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_players
      ADD COLUMN minted_by_overlay_id uuid
        REFERENCES meta_event_player_overlays(id) ON DELETE SET NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_event_players_minted_by
      ON meta_event_players (minted_by_overlay_id)
      WHERE minted_by_overlay_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_meta_event_players_minted_by`.execute(db);
  await sql`ALTER TABLE meta_event_players DROP COLUMN minted_by_overlay_id`.execute(db);
}
