import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Cross-mirror player links (ADR-014, "Two mirrors on one event"): one row per
 * standing a cited-but-unread mirror publishes, naming the live row it is. A
 * null `meta_event_player_id` is reviewed-and-distinct; the absence of a row is
 * unreviewed. `meta_event_id` is carried because a source identity is unique
 * only within its event, and the composite FK checks the linked row agrees.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_players
      ADD CONSTRAINT uq_meta_event_players_id_event UNIQUE (id, meta_event_id)
  `.execute(db);

  await sql`
    CREATE TABLE meta_player_links (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      meta_event_id uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      provider text NOT NULL,
      source_identity text NOT NULL,
      meta_event_player_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_meta_player_links_player
        FOREIGN KEY (meta_event_player_id, meta_event_id)
        REFERENCES meta_event_players(id, meta_event_id) ON DELETE CASCADE,
      CONSTRAINT uq_meta_player_links_source
        UNIQUE (meta_event_id, provider, source_identity),
      CONSTRAINT chk_meta_player_links_provider CHECK (provider <> ''),
      CONSTRAINT chk_meta_player_links_source_identity CHECK (source_identity <> '')
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_player_links_row
      ON meta_player_links (meta_event_player_id, provider)
      WHERE meta_event_player_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE meta_player_links`.execute(db);
  await sql`
    ALTER TABLE meta_event_players DROP CONSTRAINT uq_meta_event_players_id_event
  `.execute(db);
}
