import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Three normalizations the mirror had been carrying inline: the store that runs
 * an event, the player who played in one, and the recheck queue's bookkeeping.
 *
 * **Stores.** The listing nests a store object with its own integer id on every
 * event row, so the store's name was repeating across a quarter of a million
 * rows and a rename reached none of them. `uvsgames_stores` is keyed on that id
 * and upserted by the crawl, so a rename propagates the moment the store is seen
 * again. `uvsgames_events.store_name` survives as a nullable fallback: a row the
 * source published without a keyed store still has a name to show.
 *
 * The venue columns stay on the event. `location` and `timezone` describe where
 * that tournament happened, which is not the same fact as where the store is —
 * a store runs events at convention centres.
 *
 * **Players.** Registrations carry a global integer user id and the display name
 * the source shows for it, so a player is a row rather than a string repeated
 * once per event. `meta_event_players.player_name` becomes nullable and gains
 * that id: a row filed from the source stores the id and no name, and one typed
 * by hand or pushed by another provider stores the name and no id. The CHECK
 * enforces that it is always one or the other, and the partial UNIQUE gives the
 * archive the integrity it never had — one row per player per event.
 *
 * Display resolution is `COALESCE(player_name, display_name)` everywhere, which
 * doubles as the admin's override lever: writing the local column wins over the
 * source's name, and clearing it hands the player back to the source.
 * Candidates keep their own `player_name` regardless — staging is what the
 * source actually said, and a pushed candidate has no uvs identity at all.
 *
 * **Checks.** `next_check_at` and `check_stage` described the crawl's intent
 * toward the handful of accepted events, on a table whose other columns are all
 * observations of the listing. They move to `uvsgames_event_checks`, where a row
 * exists only for an event that was accepted. Existing rows are carried over
 * before the columns are dropped. `missing_since`, `first_seen_at` and
 * `last_seen_at` stay put: those are observations, not intent.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── uvsgames_stores ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE uvsgames_stores (
      id integer PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_stores_name CHECK (length(name) >= 1 AND length(name) <= 200)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON uvsgames_stores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    ALTER TABLE uvsgames_events ADD COLUMN store_id integer REFERENCES uvsgames_stores(id)
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_events_store
      ON uvsgames_events (store_id)
      WHERE store_id IS NOT NULL
  `.execute(db);

  // ── uvsgames_players ─────────────────────────────────────────────────────
  await sql`
    CREATE TABLE uvsgames_players (
      id integer PRIMARY KEY,
      display_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_players_display_name
        CHECK (length(display_name) >= 1 AND length(display_name) <= 80)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON uvsgames_players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    ALTER TABLE candidate_meta_players
      ADD COLUMN uvsgames_player_id integer REFERENCES uvsgames_players(id)
  `.execute(db);

  await sql`ALTER TABLE meta_event_players ALTER COLUMN player_name DROP NOT NULL`.execute(db);

  await sql`
    ALTER TABLE meta_event_players
      ADD COLUMN uvsgames_player_id integer REFERENCES uvsgames_players(id)
  `.execute(db);

  // The length CHECK already passes on NULL, so the identity rule is the only
  // thing that has to be added alongside the now-nullable column.
  await sql`
    ALTER TABLE meta_event_players
      ADD CONSTRAINT chk_meta_event_players_identity
      CHECK (player_name IS NOT NULL OR uvsgames_player_id IS NOT NULL)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_event_players_uvsgames_player
      ON meta_event_players (meta_event_id, uvsgames_player_id)
      WHERE uvsgames_player_id IS NOT NULL
  `.execute(db);

  // ── uvsgames_event_checks ────────────────────────────────────────────────
  // A null `next_check_at` is the ladder's terminal state rather than a deleted
  // row: the row's existence records that this event was accepted and entered
  // the queue, and `check_stage` still says how far it got.
  await sql`
    CREATE TABLE uvsgames_event_checks (
      external_id text PRIMARY KEY REFERENCES uvsgames_events(external_id) ON DELETE CASCADE,
      next_check_at timestamptz,
      check_stage smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_event_checks_stage CHECK (check_stage >= 0)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON uvsgames_event_checks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_event_checks_due
      ON uvsgames_event_checks (next_check_at)
      WHERE next_check_at IS NOT NULL
  `.execute(db);

  // Queued events and ones whose ladder already advanced are exactly the rows
  // an accept armed, so they carry over and nothing else does.
  await sql`
    INSERT INTO uvsgames_event_checks (external_id, next_check_at, check_stage)
    SELECT external_id, next_check_at, check_stage
      FROM uvsgames_events
     WHERE next_check_at IS NOT NULL OR check_stage > 0
  `.execute(db);

  await sql`ALTER TABLE uvsgames_events DROP COLUMN next_check_at`.execute(db);
  await sql`ALTER TABLE uvsgames_events DROP COLUMN check_stage`.execute(db);
}

/**
 * Puts the three inlined shapes back. The queue's rows are copied home before
 * its table is dropped; the store and player tables go with the columns that
 * referenced them, since a name that only ever came from the source is restored
 * by the next crawl or fetch.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE uvsgames_events ADD COLUMN next_check_at timestamptz`.execute(db);
  await sql`
    ALTER TABLE uvsgames_events ADD COLUMN check_stage smallint NOT NULL DEFAULT 0
  `.execute(db);
  await sql`
    UPDATE uvsgames_events e
       SET next_check_at = c.next_check_at, check_stage = c.check_stage
      FROM uvsgames_event_checks c
     WHERE c.external_id = e.external_id
  `.execute(db);
  await sql`
    ALTER TABLE uvsgames_events
      ADD CONSTRAINT chk_uvsgames_events_check_stage CHECK (check_stage >= 0)
  `.execute(db);
  await sql`
    CREATE INDEX idx_uvsgames_events_recheck
      ON uvsgames_events (next_check_at)
      WHERE next_check_at IS NOT NULL
  `.execute(db);
  await sql`DROP TABLE uvsgames_event_checks`.execute(db);

  await sql`DROP INDEX uq_meta_event_players_uvsgames_player`.execute(db);
  await sql`
    ALTER TABLE meta_event_players DROP CONSTRAINT chk_meta_event_players_identity
  `.execute(db);
  // A row filed under a uvs id alone has no name to restore, so it takes the
  // source's display name on the way back rather than failing the NOT NULL.
  await sql`
    UPDATE meta_event_players p
       SET player_name = u.display_name
      FROM uvsgames_players u
     WHERE u.id = p.uvsgames_player_id AND p.player_name IS NULL
  `.execute(db);
  await sql`ALTER TABLE meta_event_players DROP COLUMN uvsgames_player_id`.execute(db);
  await sql`ALTER TABLE meta_event_players ALTER COLUMN player_name SET NOT NULL`.execute(db);
  await sql`ALTER TABLE candidate_meta_players DROP COLUMN uvsgames_player_id`.execute(db);
  await sql`DROP TABLE uvsgames_players`.execute(db);

  await sql`DROP INDEX idx_uvsgames_events_store`.execute(db);
  await sql`ALTER TABLE uvsgames_events DROP COLUMN store_id`.execute(db);
  await sql`DROP TABLE uvsgames_stores`.execute(db);
}
