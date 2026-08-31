import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * ADR-014 revision 3: two tiers for the crawled sources, overlays for everything
 * a human writes.
 *
 * The deep fetch used to project its responses into `candidate_meta_*` rows that
 * were already matched against the catalog, keeping the unmatched original in a
 * `raw` jsonb beside them. This splits those apart: each source's own tables
 * hold what it published, in its own vocabulary, and promotion is what resolves
 * card names, maps formats and classifies tiers on the way to the live rows.
 *
 * The candidate tables are dropped rather than migrated. Live rows are
 * untouched, so the archive keeps every event, player and deck it holds; what
 * goes is the staging copy, which the next recheck pass refills from the source.
 */

/** Overlay payload columns, by table, paired with the field name that claims them. */
const OVERLAY_FIELDS: Record<string, readonly (readonly [string, string])[]> = {
  meta_event_overlays: [
    ["name", "name"],
    ["event_date", "eventDate"],
    ["format", "format"],
    ["player_count", "playerCount"],
    ["organizer", "organizer"],
    ["notes", "notes"],
    ["tier", "tier"],
    ["country", "country"],
    ["location", "location"],
  ],
  meta_event_player_overlays: [
    ["player_name", "playerName"],
    ["rank", "rank"],
    ["rank_is_tier", "rankIsTier"],
    ["wins", "wins"],
    ["losses", "losses"],
    ["draws", "draws"],
    ["match_points", "matchPoints"],
    ["opponent_match_win_pct", "opponentMatchWinPct"],
    ["game_win_pct", "gameWinPct"],
    ["opponent_game_win_pct", "opponentGameWinPct"],
    ["entry_status", "entryStatus"],
    ["legend_card_id", "legendCardId"],
    ["champion_card_id", "championCardId"],
    ["list_status", "listStatus"],
  ],
};

/**
 * `cards` claims the child line table rather than a column, so it takes part in
 * the vocabulary but has no consistency CHECK to generate.
 */
const CLAIMABLE: Record<string, readonly string[]> = {
  meta_event_overlays: OVERLAY_FIELDS.meta_event_overlays.map(([, field]) => field),
  meta_event_player_overlays: [
    ...OVERLAY_FIELDS.meta_event_player_overlays.map(([, field]) => field),
    "cards",
  ],
};

async function addMaskConstraints(db: Kysely<unknown>, table: string): Promise<void> {
  const vocabulary = CLAIMABLE[table].map((field) => `'${field}'`).join(", ");
  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(`chk_${table}_claimed_fields_known`)}
        CHECK (claimed_fields <@ ARRAY[${sql.raw(vocabulary)}]::text[])
  `.execute(db);

  for (const [column, field] of OVERLAY_FIELDS[table]) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
        ADD CONSTRAINT ${sql.raw(`chk_${table}_${column}_claimed`)}
          CHECK (${sql.raw(column)} IS NULL OR ${sql.raw(`'${field}'`)} = ANY (claimed_fields))
    `.execute(db);
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await createUvsgamesFetchTables(db);
  await createPlayloltcgFetchTables(db);
  await createOverlayTables(db);
  await relinkSubmissionsAndIgnores(db);
  await dropCandidateTables(db);
}

async function createUvsgamesFetchTables(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE uvsgames_event_standings (
      external_id text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
      registration_id text NOT NULL,
      uvsgames_player_id integer REFERENCES uvsgames_players(id),
      player_name text,
      rank integer,
      wins smallint,
      losses smallint,
      draws smallint,
      match_points integer,
      opponent_match_win_pct double precision,
      game_win_pct double precision,
      opponent_game_win_pct double precision,
      entry_status text,
      legend_name text,
      source_deck_id text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (external_id, registration_id),
      CONSTRAINT chk_uvsgames_event_standings_registration CHECK (registration_id <> ''),
      CONSTRAINT chk_uvsgames_event_standings_identity
        CHECK (uvsgames_player_id IS NOT NULL OR player_name IS NOT NULL),
      CONSTRAINT chk_uvsgames_event_standings_rank CHECK (rank IS NULL OR rank >= 1),
      CONSTRAINT chk_uvsgames_event_standings_match_points
        CHECK (match_points IS NULL OR match_points >= 0),
      CONSTRAINT chk_uvsgames_event_standings_tiebreakers CHECK (
        (opponent_match_win_pct IS NULL OR opponent_match_win_pct BETWEEN 0 AND 1)
        AND (game_win_pct IS NULL OR game_win_pct BETWEEN 0 AND 1)
        AND (opponent_game_win_pct IS NULL OR opponent_game_win_pct BETWEEN 0 AND 1)
      ),
      CONSTRAINT chk_uvsgames_event_standings_entry_status
        CHECK (entry_status IS NULL OR entry_status IN ('complete', 'eliminated', 'dropped'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_event_standings_player
      ON uvsgames_event_standings (uvsgames_player_id)
  `.execute(db);

  await sql`
    CREATE TABLE uvsgames_event_phases (
      external_id text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
      phase_order integer NOT NULL,
      name text,
      round_type text NOT NULL,
      round_count integer,
      rank_required integer,
      max_game_wins smallint,
      PRIMARY KEY (external_id, phase_order),
      CONSTRAINT chk_uvsgames_event_phases_order CHECK (phase_order >= 0),
      CONSTRAINT chk_uvsgames_event_phases_round_type CHECK (round_type <> ''),
      CONSTRAINT chk_uvsgames_event_phases_round_count
        CHECK (round_count IS NULL OR round_count > 0),
      CONSTRAINT chk_uvsgames_event_phases_rank_required
        CHECK (rank_required IS NULL OR rank_required > 0),
      CONSTRAINT chk_uvsgames_event_phases_max_game_wins
        CHECK (max_game_wins IS NULL OR max_game_wins > 0)
    )
  `.execute(db);

  await sql`
    CREATE TABLE uvsgames_event_matches (
      external_id text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
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
      PRIMARY KEY (external_id, round_id, player1_uvsgames_id),
      CONSTRAINT chk_uvsgames_event_matches_round_id CHECK (round_id <> ''),
      CONSTRAINT chk_uvsgames_event_matches_phase_order CHECK (phase_order >= 0),
      CONSTRAINT chk_uvsgames_event_matches_round_number CHECK (round_number >= 1),
      CONSTRAINT chk_uvsgames_event_matches_bye
        CHECK ((player2_uvsgames_id IS NULL) = is_bye),
      CONSTRAINT chk_uvsgames_event_matches_winner CHECK (
        winner_uvsgames_id IS NULL
        OR winner_uvsgames_id = player1_uvsgames_id
        OR winner_uvsgames_id = player2_uvsgames_id
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_event_matches_round
      ON uvsgames_event_matches (external_id, phase_order, round_number)
  `.execute(db);

  await sql`
    CREATE TABLE uvsgames_decklists (
      source_deck_id text PRIMARY KEY,
      external_id text NOT NULL REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
      fetch_status text NOT NULL,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_decklists_source_deck_id CHECK (source_deck_id <> ''),
      CONSTRAINT chk_uvsgames_decklists_fetch_status
        CHECK (fetch_status IN ('fetched', 'refused'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_decklists_event ON uvsgames_decklists (external_id)
  `.execute(db);

  await sql`
    CREATE TABLE uvsgames_decklist_cards (
      source_deck_id text NOT NULL
        REFERENCES uvsgames_decklists(source_deck_id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      zone text NOT NULL,
      quantity integer NOT NULL,
      card_name text NOT NULL,
      PRIMARY KEY (source_deck_id, line_number),
      CONSTRAINT chk_uvsgames_decklist_cards_line CHECK (line_number >= 0),
      CONSTRAINT chk_uvsgames_decklist_cards_zone CHECK (zone <> ''),
      CONSTRAINT chk_uvsgames_decklist_cards_quantity CHECK (quantity > 0),
      CONSTRAINT chk_uvsgames_decklist_cards_card_name CHECK (card_name <> '')
    )
  `.execute(db);
}

async function createPlayloltcgFetchTables(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE playloltcg_event_standings (
      activity_shop_id bigint NOT NULL
        REFERENCES playloltcg_events(activity_shop_id) ON DELETE CASCADE,
      player_key text NOT NULL,
      source_user_id bigint,
      player_name text NOT NULL,
      rank integer,
      wins smallint,
      losses smallint,
      draws smallint,
      legend_name text,
      source_deck_id text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (activity_shop_id, player_key),
      CONSTRAINT chk_playloltcg_event_standings_player_key CHECK (player_key <> ''),
      CONSTRAINT chk_playloltcg_event_standings_player_name
        CHECK (length(player_name) BETWEEN 1 AND 80),
      CONSTRAINT chk_playloltcg_event_standings_rank CHECK (rank IS NULL OR rank >= 1)
    )
  `.execute(db);

  await sql`
    CREATE TABLE playloltcg_decklists (
      source_deck_id text PRIMARY KEY,
      activity_shop_id bigint NOT NULL
        REFERENCES playloltcg_events(activity_shop_id) ON DELETE CASCADE,
      fetch_status text NOT NULL,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_playloltcg_decklists_source_deck_id CHECK (source_deck_id <> ''),
      CONSTRAINT chk_playloltcg_decklists_fetch_status
        CHECK (fetch_status IN ('fetched', 'refused'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_playloltcg_decklists_event
      ON playloltcg_decklists (activity_shop_id)
  `.execute(db);

  await sql`
    CREATE TABLE playloltcg_decklist_cards (
      source_deck_id text NOT NULL
        REFERENCES playloltcg_decklists(source_deck_id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      zone text NOT NULL,
      quantity integer NOT NULL,
      card_name text NOT NULL,
      PRIMARY KEY (source_deck_id, line_number),
      CONSTRAINT chk_playloltcg_decklist_cards_line CHECK (line_number >= 0),
      CONSTRAINT chk_playloltcg_decklist_cards_zone CHECK (zone <> ''),
      CONSTRAINT chk_playloltcg_decklist_cards_quantity CHECK (quantity > 0),
      CONSTRAINT chk_playloltcg_decklist_cards_card_name CHECK (card_name <> '')
    )
  `.execute(db);
}

async function createOverlayTables(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE meta_event_overlays (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      meta_event_id uuid REFERENCES meta_events(id) ON DELETE CASCADE,
      provider text,
      external_id text,
      name text,
      event_date date,
      format text,
      player_count integer,
      organizer text,
      notes text,
      tier text,
      country text,
      location text,
      claimed_fields text[] NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      submitted_by_user_id text NOT NULL REFERENCES users(id),
      submission_note text,
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_meta_event_overlays_claimed_nonempty
        CHECK (cardinality(claimed_fields) > 0),
      CONSTRAINT chk_meta_event_overlays_status
        CHECK (status IN ('pending', 'accepted', 'rejected')),
      CONSTRAINT chk_meta_event_overlays_accepted_at
        CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
      CONSTRAINT chk_meta_event_overlays_key_shape
        CHECK ((provider IS NULL) = (external_id IS NULL)),
      CONSTRAINT chk_meta_event_overlays_provider CHECK (provider IS NULL OR provider <> ''),
      CONSTRAINT chk_meta_event_overlays_external_id
        CHECK (external_id IS NULL OR external_id <> ''),
      CONSTRAINT chk_meta_event_overlays_name
        CHECK (name IS NULL OR length(name) BETWEEN 1 AND 120),
      CONSTRAINT chk_meta_event_overlays_format CHECK (format IS NULL OR format <> ''),
      CONSTRAINT chk_meta_event_overlays_player_count
        CHECK (player_count IS NULL OR player_count > 0),
      CONSTRAINT chk_meta_event_overlays_organizer
        CHECK (organizer IS NULL OR length(organizer) BETWEEN 1 AND 120),
      CONSTRAINT chk_meta_event_overlays_notes CHECK (notes IS NULL OR length(notes) <= 4000),
      CONSTRAINT chk_meta_event_overlays_tier
        CHECK (tier IS NULL OR tier IN ('premier', 'competitive', 'store', 'casual')),
      CONSTRAINT chk_meta_event_overlays_country CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
      CONSTRAINT chk_meta_event_overlays_location
        CHECK (location IS NULL OR length(location) BETWEEN 1 AND 500),
      CONSTRAINT chk_meta_event_overlays_submission_note
        CHECK (submission_note IS NULL OR submission_note <> '')
    )
  `.execute(db);

  await addMaskConstraints(db, "meta_event_overlays");

  await sql`
    CREATE UNIQUE INDEX uq_meta_event_overlays_source
      ON meta_event_overlays (provider, external_id) WHERE provider IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_event_overlays_pending
      ON meta_event_overlays (created_at) WHERE status = 'pending'
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_event_overlays
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE meta_event_player_overlays (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      meta_event_player_id uuid REFERENCES meta_event_players(id) ON DELETE CASCADE,
      meta_event_id uuid REFERENCES meta_events(id) ON DELETE CASCADE,
      event_overlay_id uuid REFERENCES meta_event_overlays(id) ON DELETE CASCADE,
      player_name text,
      rank integer,
      rank_is_tier boolean,
      wins smallint,
      losses smallint,
      draws smallint,
      match_points integer,
      opponent_match_win_pct double precision,
      game_win_pct double precision,
      opponent_game_win_pct double precision,
      entry_status text,
      legend_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      champion_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      list_status text,
      claimed_fields text[] NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      submitted_by_user_id text NOT NULL REFERENCES users(id),
      submission_note text,
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_meta_event_player_overlays_target
        CHECK (num_nonnulls(meta_event_player_id, meta_event_id, event_overlay_id) = 1),
      CONSTRAINT chk_meta_event_player_overlays_claimed_nonempty
        CHECK (cardinality(claimed_fields) > 0),
      CONSTRAINT chk_meta_event_player_overlays_status
        CHECK (status IN ('pending', 'accepted', 'rejected')),
      CONSTRAINT chk_meta_event_player_overlays_accepted_at
        CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
      CONSTRAINT chk_meta_event_player_overlays_player_name
        CHECK (player_name IS NULL OR length(player_name) BETWEEN 1 AND 80),
      CONSTRAINT chk_meta_event_player_overlays_rank CHECK (rank IS NULL OR rank >= 1),
      CONSTRAINT chk_meta_event_player_overlays_match_points
        CHECK (match_points IS NULL OR match_points >= 0),
      CONSTRAINT chk_meta_event_player_overlays_tiebreakers CHECK (
        (opponent_match_win_pct IS NULL OR opponent_match_win_pct BETWEEN 0 AND 1)
        AND (game_win_pct IS NULL OR game_win_pct BETWEEN 0 AND 1)
        AND (opponent_game_win_pct IS NULL OR opponent_game_win_pct BETWEEN 0 AND 1)
      ),
      CONSTRAINT chk_meta_event_player_overlays_entry_status
        CHECK (entry_status IS NULL OR entry_status IN ('complete', 'eliminated', 'dropped')),
      CONSTRAINT chk_meta_event_player_overlays_list_status
        CHECK (list_status IS NULL OR list_status IN ('none', 'partial', 'full')),
      CONSTRAINT chk_meta_event_player_overlays_submission_note
        CHECK (submission_note IS NULL OR submission_note <> '')
    )
  `.execute(db);

  await addMaskConstraints(db, "meta_event_player_overlays");

  await sql`
    CREATE INDEX idx_meta_event_player_overlays_pending
      ON meta_event_player_overlays (created_at) WHERE status = 'pending'
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_event_player_overlays
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE meta_event_player_overlay_cards (
      overlay_id uuid NOT NULL
        REFERENCES meta_event_player_overlays(id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      zone text NOT NULL,
      quantity integer NOT NULL,
      card_name text NOT NULL,
      card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      PRIMARY KEY (overlay_id, line_number),
      CONSTRAINT chk_meta_event_player_overlay_cards_line CHECK (line_number >= 0),
      CONSTRAINT chk_meta_event_player_overlay_cards_zone CHECK (zone <> ''),
      CONSTRAINT chk_meta_event_player_overlay_cards_quantity CHECK (quantity > 0),
      CONSTRAINT chk_meta_event_player_overlay_cards_card_name CHECK (card_name <> '')
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_event_player_overlay_cards_unresolved
      ON meta_event_player_overlay_cards (overlay_id) WHERE card_id IS NULL
  `.execute(db);
}

async function relinkSubmissionsAndIgnores(db: Kysely<unknown>): Promise<void> {
  // Promotion reads the linked sources in this order; the lowest number wins a
  // field two sources both hold.
  await sql`
    ALTER TABLE meta_event_sources ADD COLUMN priority integer NOT NULL DEFAULT 0
  `.execute(db);

  await sql`
    ALTER TABLE meta_submissions
      DROP COLUMN candidate_meta_player_id,
      ADD COLUMN player_overlay_id uuid
        REFERENCES meta_event_player_overlays(id) ON DELETE SET NULL
  `.execute(db);

  // Same keys and the same skip-at-ingest job, renamed for the tier they guard.
  await sql`ALTER TABLE ignored_candidate_meta_events RENAME TO ignored_meta_source_events`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_meta_players RENAME TO ignored_meta_source_players`.execute(
    db,
  );
  await renameIgnoreConstraints(db, IGNORE_CONSTRAINT_RENAMES);
}

/**
 * A table rename leaves its constraints named for the old table, which is the
 * drift this revision exists to remove. Migration 263 set the pattern when it
 * renamed `meta_catalog_events`.
 *
 * The `_decks` names on the players table are older still: it was
 * `ignored_candidate_meta_decks` before the standings pyramid.
 */
const IGNORE_CONSTRAINT_RENAMES: readonly (readonly [string, string, string])[] = [
  [
    "ignored_meta_source_events",
    "ignored_candidate_meta_events_pkey",
    "ignored_meta_source_events_pkey",
  ],
  [
    "ignored_meta_source_events",
    "chk_ignored_candidate_meta_events_provider",
    "chk_ignored_meta_source_events_provider",
  ],
  [
    "ignored_meta_source_events",
    "chk_ignored_candidate_meta_events_external_id",
    "chk_ignored_meta_source_events_external_id",
  ],
  [
    "ignored_meta_source_events",
    "ignored_candidate_meta_events_provider_not_null",
    "ignored_meta_source_events_provider_not_null",
  ],
  [
    "ignored_meta_source_events",
    "ignored_candidate_meta_events_external_id_not_null",
    "ignored_meta_source_events_external_id_not_null",
  ],
  [
    "ignored_meta_source_events",
    "ignored_candidate_meta_events_created_at_not_null",
    "ignored_meta_source_events_created_at_not_null",
  ],
  [
    "ignored_meta_source_players",
    "ignored_candidate_meta_players_pkey",
    "ignored_meta_source_players_pkey",
  ],
  [
    "ignored_meta_source_players",
    "chk_ignored_candidate_meta_players_provider",
    "chk_ignored_meta_source_players_provider",
  ],
  [
    "ignored_meta_source_players",
    "chk_ignored_candidate_meta_players_event_external_id",
    "chk_ignored_meta_source_players_event_external_id",
  ],
  [
    "ignored_meta_source_players",
    "chk_ignored_candidate_meta_players_external_id",
    "chk_ignored_meta_source_players_external_id",
  ],
  [
    "ignored_meta_source_players",
    "ignored_candidate_meta_decks_provider_not_null",
    "ignored_meta_source_players_provider_not_null",
  ],
  [
    "ignored_meta_source_players",
    "ignored_candidate_meta_decks_event_external_id_not_null",
    "ignored_meta_source_players_event_external_id_not_null",
  ],
  [
    "ignored_meta_source_players",
    "ignored_candidate_meta_decks_external_id_not_null",
    "ignored_meta_source_players_external_id_not_null",
  ],
  [
    "ignored_meta_source_players",
    "ignored_candidate_meta_decks_created_at_not_null",
    "ignored_meta_source_players_created_at_not_null",
  ],
];

async function renameIgnoreConstraints(
  db: Kysely<unknown>,
  renames: readonly (readonly [string, string, string])[],
): Promise<void> {
  for (const [table, from, to] of renames) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
        RENAME CONSTRAINT ${sql.raw(from)} TO ${sql.raw(to)}
    `.execute(db);
  }
}

async function dropCandidateTables(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE candidate_meta_matches`.execute(db);
  await sql`DROP TABLE candidate_meta_players`.execute(db);
  await sql`DROP TABLE candidate_meta_events`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await restoreCandidateTables(db);

  await renameIgnoreConstraints(
    db,
    IGNORE_CONSTRAINT_RENAMES.map(([table, from, to]) => [table, to, from] as const).toReversed(),
  );
  await sql`ALTER TABLE ignored_meta_source_players RENAME TO ignored_candidate_meta_players`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_meta_source_events RENAME TO ignored_candidate_meta_events`.execute(
    db,
  );

  await sql`
    ALTER TABLE meta_submissions
      DROP COLUMN player_overlay_id,
      ADD COLUMN candidate_meta_player_id uuid
        REFERENCES candidate_meta_players(id) ON DELETE SET NULL
  `.execute(db);
  await sql`ALTER TABLE meta_event_sources DROP COLUMN priority`.execute(db);

  await sql`DROP TABLE meta_event_player_overlay_cards`.execute(db);
  await sql`DROP TABLE meta_event_player_overlays`.execute(db);
  await sql`DROP TABLE meta_event_overlays`.execute(db);

  await sql`DROP TABLE playloltcg_decklist_cards`.execute(db);
  await sql`DROP TABLE playloltcg_decklists`.execute(db);
  await sql`DROP TABLE playloltcg_event_standings`.execute(db);

  await sql`DROP TABLE uvsgames_decklist_cards`.execute(db);
  await sql`DROP TABLE uvsgames_decklists`.execute(db);
  await sql`DROP TABLE uvsgames_event_matches`.execute(db);
  await sql`DROP TABLE uvsgames_event_phases`.execute(db);
  await sql`DROP TABLE uvsgames_event_standings`.execute(db);
}

/**
 * The candidate tables as migration 270 left them, structure only.
 *
 * Rolling back past this point walks 269 down to 236, and several of those
 * alter or drop these tables by name. The constraint and index names have to be
 * the ones they expect, so this is a transcription of the schema snapshot
 * rather than a fresh design. The NOT NULL constraints keep their pre-rename
 * `candidate_meta_decks_*` names because 261's down renames them back.
 */
async function restoreCandidateTables(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE candidate_meta_events (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      provider text NOT NULL,
      external_id text NOT NULL,
      name text NOT NULL,
      event_date date NOT NULL,
      format text NOT NULL,
      player_count integer,
      organizer text,
      source_url text,
      notes text,
      meta_event_id uuid REFERENCES meta_events(id) ON DELETE SET NULL,
      checked_at timestamptz,
      extra_data jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      raw jsonb,
      fetched_at timestamptz,
      tier text,
      country text,
      location text,
      CONSTRAINT uq_candidate_meta_events_source UNIQUE (provider, external_id),
      CONSTRAINT chk_candidate_meta_events_country
        CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
      CONSTRAINT chk_candidate_meta_events_external_id CHECK (external_id <> ''),
      CONSTRAINT chk_candidate_meta_events_extra_data_shape
        CHECK (extra_data IS NULL OR jsonb_typeof(extra_data) = 'object'),
      CONSTRAINT chk_candidate_meta_events_format CHECK (format <> ''),
      CONSTRAINT chk_candidate_meta_events_location
        CHECK (location IS NULL OR length(location) BETWEEN 1 AND 500),
      CONSTRAINT chk_candidate_meta_events_name CHECK (length(name) BETWEEN 1 AND 120),
      CONSTRAINT chk_candidate_meta_events_notes CHECK (notes IS NULL OR length(notes) <= 4000),
      CONSTRAINT chk_candidate_meta_events_organizer
        CHECK (organizer IS NULL OR length(organizer) BETWEEN 1 AND 120),
      CONSTRAINT chk_candidate_meta_events_player_count
        CHECK (player_count IS NULL OR player_count > 0),
      CONSTRAINT chk_candidate_meta_events_provider CHECK (provider <> ''),
      CONSTRAINT chk_candidate_meta_events_raw_shape
        CHECK (raw IS NULL OR jsonb_typeof(raw) = 'object'),
      CONSTRAINT chk_candidate_meta_events_source_url
        CHECK (source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000),
      CONSTRAINT chk_candidate_meta_events_tier
        CHECK (tier IS NULL OR tier IN ('premier', 'competitive', 'store', 'casual'))
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE candidate_meta_players (
      id uuid PRIMARY KEY DEFAULT uuidv7()
        CONSTRAINT candidate_meta_decks_id_not_null NOT NULL,
      candidate_event_id uuid REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
      external_id text CONSTRAINT candidate_meta_decks_external_id_not_null NOT NULL,
      player_name text CONSTRAINT candidate_meta_decks_player_name_not_null NOT NULL,
      rank integer CONSTRAINT candidate_meta_decks_finish_tier_not_null NOT NULL,
      cards jsonb,
      list_status text DEFAULT 'none'
        CONSTRAINT candidate_meta_decks_list_status_not_null NOT NULL,
      checked_at timestamptz,
      created_at timestamptz DEFAULT now()
        CONSTRAINT candidate_meta_decks_created_at_not_null NOT NULL,
      updated_at timestamptz DEFAULT now()
        CONSTRAINT candidate_meta_decks_updated_at_not_null NOT NULL,
      meta_event_id uuid REFERENCES meta_events(id) ON DELETE CASCADE,
      submitted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      submission_note text,
      meta_event_player_id uuid REFERENCES meta_event_players(id) ON DELETE SET NULL,
      rank_is_tier boolean DEFAULT false
        CONSTRAINT candidate_meta_decks_rank_is_tier_not_null NOT NULL,
      wins smallint,
      losses smallint,
      draws smallint,
      legend_name text,
      champion_name text,
      legend_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      champion_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      uvsgames_player_id integer REFERENCES uvsgames_players(id),
      match_points integer,
      opponent_match_win_pct double precision,
      game_win_pct double precision,
      opponent_game_win_pct double precision,
      entry_status text,
      CONSTRAINT uq_candidate_meta_players_source UNIQUE (candidate_event_id, external_id),
      CONSTRAINT chk_candidate_meta_players_cards_shape
        CHECK (cards IS NULL OR jsonb_typeof(cards) = 'array'),
      CONSTRAINT chk_candidate_meta_players_entry_status
        CHECK (entry_status IS NULL OR entry_status IN ('complete', 'eliminated', 'dropped')),
      CONSTRAINT chk_candidate_meta_players_external_id CHECK (external_id <> ''),
      CONSTRAINT chk_candidate_meta_players_list_status
        CHECK (list_status IN ('none', 'partial', 'full')),
      CONSTRAINT chk_candidate_meta_players_match_points
        CHECK (match_points IS NULL OR match_points >= 0),
      CONSTRAINT chk_candidate_meta_players_parent
        CHECK (num_nonnulls(candidate_event_id, meta_event_id) = 1),
      CONSTRAINT chk_candidate_meta_players_player_name
        CHECK (length(player_name) BETWEEN 1 AND 80),
      CONSTRAINT chk_candidate_meta_players_rank CHECK (rank >= 1),
      CONSTRAINT chk_candidate_meta_players_submission_note CHECK (submission_note <> ''),
      CONSTRAINT chk_candidate_meta_players_tiebreakers CHECK (
        (opponent_match_win_pct IS NULL OR opponent_match_win_pct BETWEEN 0 AND 1)
        AND (game_win_pct IS NULL OR game_win_pct BETWEEN 0 AND 1)
        AND (opponent_game_win_pct IS NULL OR opponent_game_win_pct BETWEEN 0 AND 1)
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_candidate_meta_players_meta_event
      ON candidate_meta_players (meta_event_id) WHERE meta_event_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_candidate_meta_players_submission
      ON candidate_meta_players (meta_event_id, external_id) WHERE meta_event_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE candidate_meta_matches (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      candidate_event_id uuid NOT NULL
        REFERENCES candidate_meta_events(id) ON DELETE CASCADE,
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
      source_match_id text NOT NULL,
      CONSTRAINT uq_candidate_meta_matches_source
        UNIQUE (candidate_event_id, source_match_id),
      CONSTRAINT chk_candidate_meta_matches_bye
        CHECK ((player2_uvsgames_id IS NULL) = is_bye),
      CONSTRAINT chk_candidate_meta_matches_phase_order CHECK (phase_order >= 0),
      CONSTRAINT chk_candidate_meta_matches_round_id CHECK (round_id <> ''),
      CONSTRAINT chk_candidate_meta_matches_round_number CHECK (round_number >= 1),
      CONSTRAINT chk_candidate_meta_matches_source_match_id CHECK (source_match_id <> ''),
      CONSTRAINT chk_candidate_meta_matches_winner CHECK (
        winner_uvsgames_id IS NULL
        OR winner_uvsgames_id = player1_uvsgames_id
        OR winner_uvsgames_id = player2_uvsgames_id
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_candidate_meta_matches_unstamped
      ON candidate_meta_matches (candidate_event_id) WHERE meta_event_match_id IS NULL
  `.execute(db);
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_matches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}
