import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Repairs to the two-tier rebuild (ADR-014 revision 3), shipped before it ever
 * ran in production.
 *
 * - `meta_event_players.source_identity` stores the identity promotion filed a
 *   row under, so a re-promote matches on a stored fact instead of re-deriving
 *   one from columns an overlay may have rewritten. Backfilled from the
 *   uvsgames player id; name-keyed rows are stamped on their next promote.
 * - `uvsgames_event_matches.source_match_id` carries the source's own match id
 *   through to the live table, whose upsert already keys on it. The mirror
 *   table is cleared first: no row can exist (the insert path named this very
 *   column before it existed), but a re-stage is cheap and the constraint
 *   needs the table empty to be NOT NULL.
 * - `uvsgames_events.results_fetched_at` records that a results fetch
 *   completed, which "the mirror holds standings rows" cannot: a cancelled
 *   event or one with no placements has none and would be re-fetched forever.
 * - `meta_event_player_overlays.provider` + `source_player_key` give a pushed
 *   standings row a stable identity across re-uploads, so a provider
 *   re-posting an event updates its rows instead of duplicating them. The key
 *   survives the overlay being re-anchored when its event is accepted.
 * - The overlay tables gain indexes on every FK promotion or a cascade walks.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_players
      ADD COLUMN source_identity text,
      ADD CONSTRAINT chk_meta_event_players_source_identity
        CHECK (source_identity IS NULL OR source_identity <> '')
  `.execute(db);
  await sql`
    UPDATE meta_event_players
      SET source_identity = 'u' || uvsgames_player_id
      WHERE uvsgames_player_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_meta_event_players_source_identity
      ON meta_event_players (meta_event_id, source_identity)
      WHERE source_identity IS NOT NULL
  `.execute(db);

  await sql`DELETE FROM uvsgames_event_matches`.execute(db);
  await sql`
    ALTER TABLE uvsgames_event_matches
      ADD COLUMN source_match_id text NOT NULL,
      ADD CONSTRAINT chk_uvsgames_event_matches_source_match_id CHECK (source_match_id <> '')
  `.execute(db);

  await sql`ALTER TABLE uvsgames_events ADD COLUMN results_fetched_at timestamptz`.execute(db);
  await sql`
    UPDATE uvsgames_events
      SET results_fetched_at = standings.last_fetched
      FROM (
        SELECT external_id, max(fetched_at) AS last_fetched
        FROM uvsgames_event_standings
        GROUP BY external_id
      ) AS standings
      WHERE standings.external_id = uvsgames_events.external_id
  `.execute(db);

  await sql`
    ALTER TABLE meta_event_player_overlays
      ADD COLUMN provider text,
      ADD COLUMN source_player_key text,
      ADD CONSTRAINT chk_meta_event_player_overlays_source_key CHECK (
        (provider IS NULL) = (source_player_key IS NULL)
        AND (provider IS NULL OR (provider <> '' AND source_player_key <> ''))
      )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_meta_event_player_overlays_source_key
      ON meta_event_player_overlays (provider, source_player_key)
      WHERE provider IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_event_overlays_event ON meta_event_overlays (meta_event_id)
  `.execute(db);
  await sql`
    CREATE INDEX idx_meta_event_player_overlays_event
      ON meta_event_player_overlays (meta_event_id)
  `.execute(db);
  await sql`
    CREATE INDEX idx_meta_event_player_overlays_player
      ON meta_event_player_overlays (meta_event_player_id)
  `.execute(db);
  await sql`
    CREATE INDEX idx_meta_event_player_overlays_event_overlay
      ON meta_event_player_overlays (event_overlay_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_meta_event_player_overlays_event_overlay`.execute(db);
  await sql`DROP INDEX idx_meta_event_player_overlays_player`.execute(db);
  await sql`DROP INDEX idx_meta_event_player_overlays_event`.execute(db);
  await sql`DROP INDEX idx_meta_event_overlays_event`.execute(db);
  await sql`DROP INDEX uq_meta_event_player_overlays_source_key`.execute(db);
  await sql`
    ALTER TABLE meta_event_player_overlays
      DROP CONSTRAINT chk_meta_event_player_overlays_source_key,
      DROP COLUMN source_player_key,
      DROP COLUMN provider
  `.execute(db);
  await sql`ALTER TABLE uvsgames_events DROP COLUMN results_fetched_at`.execute(db);
  await sql`
    ALTER TABLE uvsgames_event_matches
      DROP CONSTRAINT chk_uvsgames_event_matches_source_match_id,
      DROP COLUMN source_match_id
  `.execute(db);
  await sql`DROP INDEX uq_meta_event_players_source_identity`.execute(db);
  await sql`
    ALTER TABLE meta_event_players
      DROP CONSTRAINT chk_meta_event_players_source_identity,
      DROP COLUMN source_identity
  `.execute(db);
}
