import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The third meta source: topdeck.gg. One `POST /v2/tournaments` per format
 * returns the tournament, its standings and every submitted decklist in a
 * single body, so this source needs no deep-fetch queue and no recheck ladder
 * — the mirror is written complete on the sync pass that finds the event.
 *
 * **Events.** Keyed on the source's `TID`, a slug. `start_at` is a real instant
 * rather than a day: the source publishes unix seconds with no timezone, and
 * 115 of 296 sampled events start after 22:00 UTC, so the UTC day files an
 * American evening event under the next date. The venue-local day is derived at
 * promotion from `longitude`.
 *
 * **Standings.** Ordered by finish in the payload, so `rank` is the position.
 * The source serves no match points and no opponent tiebreakers for Riftbound,
 * which is why those columns are absent here rather than nullable.
 *
 * **Decklists.** The payload carries the list inline per standing, so there is
 * no source-side deck id to key on; `source_deck_id` is `<tid>:<player_key>`.
 *
 * **`meta_event_sources.contributes`.** A second mirror on one event would
 * insert a duplicate player row per entrant, because standings identity is
 * provider-scoped and nothing merges across providers yet. Until confirmed
 * player links exist, a citation may be carried for attribution without
 * promoting: false means the source is listed and never read.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE topdeck_events (
      tid text PRIMARY KEY,
      name text NOT NULL,
      format text NOT NULL,
      start_at timestamptz NOT NULL,
      swiss_rounds integer,
      top_cut integer,
      player_count integer,
      is_team_event boolean NOT NULL DEFAULT false,
      team_size integer,
      city text,
      state text,
      country text,
      address text,
      longitude double precision,
      latitude double precision,
      content_hash text NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL,
      missing_since timestamptz,
      CONSTRAINT chk_topdeck_events_tid CHECK (tid <> ''),
      CONSTRAINT chk_topdeck_events_name CHECK (length(name) >= 1),
      CONSTRAINT chk_topdeck_events_format CHECK (format <> ''),
      CONSTRAINT chk_topdeck_events_content_hash CHECK (content_hash <> ''),
      CONSTRAINT chk_topdeck_events_player_count CHECK (player_count IS NULL OR player_count >= 0),
      CONSTRAINT chk_topdeck_events_swiss_rounds CHECK (swiss_rounds IS NULL OR swiss_rounds >= 0),
      CONSTRAINT chk_topdeck_events_top_cut CHECK (top_cut IS NULL OR top_cut >= 0),
      CONSTRAINT chk_topdeck_events_team_size CHECK (team_size IS NULL OR team_size > 0),
      CONSTRAINT chk_topdeck_events_country CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
    )
  `.execute(db);

  await sql`CREATE INDEX idx_topdeck_events_start ON topdeck_events (start_at)`.execute(db);
  await sql`CREATE INDEX idx_topdeck_events_format ON topdeck_events (format)`.execute(db);

  await sql`
    CREATE TABLE topdeck_event_standings (
      tid text NOT NULL REFERENCES topdeck_events(tid) ON DELETE CASCADE,
      player_key text NOT NULL,
      source_player_id text,
      player_name text NOT NULL,
      rank integer,
      wins smallint,
      losses smallint,
      draws smallint,
      legend_name text,
      source_deck_id text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tid, player_key),
      CONSTRAINT chk_topdeck_event_standings_player_key CHECK (player_key <> ''),
      CONSTRAINT chk_topdeck_event_standings_player_name
        CHECK (length(player_name) BETWEEN 1 AND 80),
      CONSTRAINT chk_topdeck_event_standings_rank CHECK (rank IS NULL OR rank >= 1)
    )
  `.execute(db);

  await sql`
    CREATE TABLE topdeck_decklists (
      source_deck_id text PRIMARY KEY,
      tid text NOT NULL REFERENCES topdeck_events(tid) ON DELETE CASCADE,
      fetch_status text NOT NULL,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_topdeck_decklists_source_deck_id CHECK (source_deck_id <> ''),
      CONSTRAINT chk_topdeck_decklists_fetch_status
        CHECK (fetch_status IN ('fetched', 'refused'))
    )
  `.execute(db);

  await sql`CREATE INDEX idx_topdeck_decklists_event ON topdeck_decklists (tid)`.execute(db);

  await sql`
    CREATE TABLE topdeck_decklist_cards (
      source_deck_id text NOT NULL
        REFERENCES topdeck_decklists(source_deck_id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      zone text NOT NULL,
      quantity integer NOT NULL,
      card_name text NOT NULL,
      PRIMARY KEY (source_deck_id, line_number),
      CONSTRAINT chk_topdeck_decklist_cards_line CHECK (line_number >= 0),
      CONSTRAINT chk_topdeck_decklist_cards_zone CHECK (zone <> ''),
      CONSTRAINT chk_topdeck_decklist_cards_quantity CHECK (quantity > 0),
      CONSTRAINT chk_topdeck_decklist_cards_card_name CHECK (card_name <> '')
    )
  `.execute(db);

  await sql`
    ALTER TABLE meta_event_sources
      ADD COLUMN contributes boolean NOT NULL DEFAULT true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE meta_event_sources DROP COLUMN contributes`.execute(db);
  await sql`DROP TABLE topdeck_decklist_cards`.execute(db);
  await sql`DROP TABLE topdeck_decklists`.execute(db);
  await sql`DROP TABLE topdeck_event_standings`.execute(db);
  await sql`DROP TABLE topdeck_events`.execute(db);
}
