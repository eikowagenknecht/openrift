import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Pairings (ADR-014, "Pairings"): the per-round match lists the official
 * source publishes for every completed round, stored as per-match facts.
 *
 * `candidate_meta_matches` is the staging tier. The deep fetch is its only
 * producer, so the event FK is NOT NULL, and it references `uvsgames_players`
 * because the source keys match participants by user id. Participants are
 * ordered deterministically at parse time (by user id), so
 * `(candidate_event_id, round_id, player1_uvsgames_id)` is a natural key: one
 * row per round per first-seat player, and a bye keeps its single player in
 * that seat. It does not stop a player the source pairs twice in one round from
 * taking the second match's `player2_uvsgames_id`.
 *
 * `meta_event_matches` is the live tier and hangs off `meta_event_players`,
 * not the source layer, so a second pairings source would land the way
 * standings do. `candidate_meta_matches.meta_event_match_id` is the stamp the
 * materialization writes back; a NULL stamp marks a match still waiting for
 * its participants to be accepted.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE meta_event_matches (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      meta_event_id uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      phase_order integer NOT NULL DEFAULT 0,
      round_number integer NOT NULL,
      table_number integer,
      is_bye boolean NOT NULL DEFAULT false,
      is_draw boolean NOT NULL DEFAULT false,
      player1_id uuid NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
      player2_id uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
      winner_id uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
      games_won_p1 smallint,
      games_won_p2 smallint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_meta_event_matches_phase_order CHECK (phase_order >= 0),
      CONSTRAINT chk_meta_event_matches_round_number CHECK (round_number >= 1),
      CONSTRAINT chk_meta_event_matches_bye CHECK ((player2_id IS NULL) = is_bye),
      CONSTRAINT chk_meta_event_matches_winner
        CHECK (winner_id IS NULL OR winner_id = player1_id OR winner_id = player2_id),
      CONSTRAINT uq_meta_event_matches_seat
        UNIQUE (meta_event_id, phase_order, round_number, player1_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_event_matches_round
      ON meta_event_matches (meta_event_id, phase_order, round_number)
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_event_matches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE candidate_meta_matches (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      candidate_event_id uuid NOT NULL REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
      round_id text NOT NULL,
      phase_order integer NOT NULL DEFAULT 0,
      round_number integer NOT NULL,
      table_number integer,
      is_bye boolean NOT NULL DEFAULT false,
      is_draw boolean NOT NULL DEFAULT false,
      player1_uvsgames_id integer NOT NULL REFERENCES uvsgames_players(id),
      player2_uvsgames_id integer REFERENCES uvsgames_players(id),
      winner_uvsgames_id integer REFERENCES uvsgames_players(id),
      games_won_p1 smallint,
      games_won_p2 smallint,
      meta_event_match_id uuid REFERENCES meta_event_matches(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_candidate_meta_matches_round_id CHECK (round_id <> ''),
      CONSTRAINT chk_candidate_meta_matches_phase_order CHECK (phase_order >= 0),
      CONSTRAINT chk_candidate_meta_matches_round_number CHECK (round_number >= 1),
      CONSTRAINT chk_candidate_meta_matches_bye CHECK ((player2_uvsgames_id IS NULL) = is_bye),
      CONSTRAINT chk_candidate_meta_matches_winner
        CHECK (
          winner_uvsgames_id IS NULL
          OR winner_uvsgames_id = player1_uvsgames_id
          OR winner_uvsgames_id = player2_uvsgames_id
        ),
      CONSTRAINT uq_candidate_meta_matches_seat
        UNIQUE (candidate_event_id, round_id, player1_uvsgames_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_candidate_meta_matches_unstamped
      ON candidate_meta_matches (candidate_event_id)
      WHERE meta_event_match_id IS NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_matches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE candidate_meta_matches`.execute(db);
  await sql`DROP TABLE meta_event_matches`.execute(db);
}
