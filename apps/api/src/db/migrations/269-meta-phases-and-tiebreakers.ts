import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The parts of an official standings sheet the archive was dropping.
 *
 * Three additions, all from payloads the deep fetch already reads:
 *
 * `meta_event_phases` gives `meta_event_matches.phase_order` a meaning. The
 * source's phase list says whether a phase was Swiss or single elimination,
 * how many rounds it ran, what rank entered it, and how many game wins took a
 * match. Without it round 14 of a Regional Qualifier renders as "phase 3,
 * round 1" instead of "Top 8, quarterfinal", and a 2-1 game record cannot be
 * read at all because Bo1 and Bo3 look identical.
 *
 * The standings columns (`match_points` and the three tiebreakers the source's
 * own `tiebreaker_columns` names: OMWP, GWP, OGWP) are what the standings are
 * sorted by. A rank without them cannot be explained or verified. `entry_status`
 * separates a player who dropped from one who lost every round, which the
 * record alone cannot say.
 *
 * `source_match_id` makes a match's identity the source's own. The key was
 * `(event, phase, round, first seat)`, derived from the participants after
 * ordering them by user id, which meant a player the source paired twice in one
 * round lost the second match at parse time. Both tiers now key on the source's
 * id. The staging tier takes it outright, since the deep fetch is its only
 * producer. The live tier keeps the seat key as a partial-index fallback for
 * rows with no source id: it hangs off `meta_event_players` on purpose
 * (ADR-014, "Pairings"), so a hand-entered match has to stay representable.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Phases ───────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE meta_event_phases (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      meta_event_id uuid NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      phase_order integer NOT NULL,
      name text,
      round_type text NOT NULL,
      round_count integer,
      rank_required integer,
      max_game_wins smallint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_meta_event_phases_phase_order CHECK (phase_order >= 0),
      CONSTRAINT chk_meta_event_phases_name CHECK (name IS NULL OR length(name) BETWEEN 1 AND 120),
      CONSTRAINT chk_meta_event_phases_round_type CHECK (round_type <> ''),
      CONSTRAINT chk_meta_event_phases_round_count CHECK (round_count IS NULL OR round_count > 0),
      CONSTRAINT chk_meta_event_phases_rank_required
        CHECK (rank_required IS NULL OR rank_required > 0),
      CONSTRAINT chk_meta_event_phases_max_game_wins
        CHECK (max_game_wins IS NULL OR max_game_wins > 0),
      CONSTRAINT uq_meta_event_phases_order UNIQUE (meta_event_id, phase_order)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_event_phases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── Standings detail ─────────────────────────────────────────────────────
  // double precision, not numeric, so postgres.js hands back a JS number
  // (the same reason `copies.grade` is one, migration 194).
  for (const table of ["meta_event_players", "candidate_meta_players"]) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
        ADD COLUMN match_points integer,
        ADD COLUMN opponent_match_win_pct double precision,
        ADD COLUMN game_win_pct double precision,
        ADD COLUMN opponent_game_win_pct double precision,
        ADD COLUMN entry_status text
    `.execute(db);

    await sql`
      ALTER TABLE ${sql.raw(table)}
        ADD CONSTRAINT ${sql.raw(`chk_${table}_match_points`)}
          CHECK (match_points IS NULL OR match_points >= 0),
        ADD CONSTRAINT ${sql.raw(`chk_${table}_tiebreakers`)}
          CHECK (
            (opponent_match_win_pct IS NULL OR opponent_match_win_pct BETWEEN 0 AND 1)
            AND (game_win_pct IS NULL OR game_win_pct BETWEEN 0 AND 1)
            AND (opponent_game_win_pct IS NULL OR opponent_game_win_pct BETWEEN 0 AND 1)
          ),
        ADD CONSTRAINT ${sql.raw(`chk_${table}_entry_status`)}
          CHECK (entry_status IS NULL OR entry_status IN ('complete', 'eliminated', 'dropped'))
    `.execute(db);
  }

  // ── Source-keyed matches ─────────────────────────────────────────────────
  await sql`
    ALTER TABLE meta_event_matches
      ADD COLUMN source_match_id text,
      ADD COLUMN source_round_id text,
      ADD CONSTRAINT chk_meta_event_matches_source_match_id
        CHECK (source_match_id IS NULL OR source_match_id <> ''),
      ADD CONSTRAINT chk_meta_event_matches_source_round_id
        CHECK (source_round_id IS NULL OR source_round_id <> '')
  `.execute(db);

  await sql`
    ALTER TABLE meta_event_matches DROP CONSTRAINT uq_meta_event_matches_seat
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_event_matches_source
      ON meta_event_matches (meta_event_id, source_match_id)
      WHERE source_match_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_event_matches_seat
      ON meta_event_matches (meta_event_id, phase_order, round_number, player1_id)
      WHERE source_match_id IS NULL
  `.execute(db);

  // The staging tier takes the source key outright, with no seat fallback: the
  // deep fetch is its only producer and drops a match the source gave no id
  // for. NOT NULL is safe because `candidate_meta_matches` is created by
  // migration 268, which has never run outside a development database — and a
  // dev database holding staged rows should fail here loudly rather than carry
  // rows no materialization can key.
  await sql`
    ALTER TABLE candidate_meta_matches
      ADD COLUMN source_match_id text NOT NULL,
      ADD CONSTRAINT chk_candidate_meta_matches_source_match_id
        CHECK (source_match_id <> ''),
      DROP CONSTRAINT uq_candidate_meta_matches_seat,
      ADD CONSTRAINT uq_candidate_meta_matches_source
        UNIQUE (candidate_event_id, source_match_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE candidate_meta_matches
      DROP CONSTRAINT uq_candidate_meta_matches_source,
      DROP COLUMN source_match_id,
      ADD CONSTRAINT uq_candidate_meta_matches_seat
        UNIQUE (candidate_event_id, round_id, player1_uvsgames_id)
  `.execute(db);

  await sql`DROP INDEX uq_meta_event_matches_seat`.execute(db);
  await sql`DROP INDEX uq_meta_event_matches_source`.execute(db);
  await sql`
    ALTER TABLE meta_event_matches
      ADD CONSTRAINT uq_meta_event_matches_seat
        UNIQUE (meta_event_id, phase_order, round_number, player1_id)
  `.execute(db);
  await sql`
    ALTER TABLE meta_event_matches
      DROP COLUMN source_round_id,
      DROP COLUMN source_match_id
  `.execute(db);

  for (const table of ["meta_event_players", "candidate_meta_players"]) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
        DROP COLUMN entry_status,
        DROP COLUMN opponent_game_win_pct,
        DROP COLUMN game_win_pct,
        DROP COLUMN opponent_match_win_pct,
        DROP COLUMN match_points
    `.execute(db);
  }

  await sql`DROP TABLE meta_event_phases`.execute(db);
}
