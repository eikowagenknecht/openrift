import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The second meta source: the official Chinese app (playloltcg). Its event
 * listing is a global date-ranged query — `activityShop/page` with a
 * `startTime`/`endTime` range and empty `userLocation` returns every event
 * nationwide, no shop id needed (verified 2026-08-30). So the shape mirrors
 * uvsgames: a date-window mirror, a shop registry, and a recheck queue.
 *
 * **Shops.** The registry (`searchShop`, ~1,515 rows in one call) carries the
 * structured geography and the store ids the event listing omits. It stands on
 * its own as the store directory.
 *
 * **Events.** Keyed on `activityShopId`. The venue lives on the event — the
 * listing carries `shopName` and full geography per row — but no store id. The
 * listing never links the shop, so `shop_id` stays null until the event is
 * deep-fetched: the `activityShop/info` detail carries the exact
 * `shopInfoResponse.id`, so an accepted event gets a precise link on a call the
 * fetch makes anyway, and `shop_name` is the display fallback until then.
 * `status` is the source's `sortWeight` lifecycle (1 registration-open … 5
 * finished), the `display_status` equivalent the recheck ladder keys on.
 *
 * **Checks.** The recheck queue, one row per accepted event, split from the
 * mirror as uvsgames splits it. Standings and decks are deep-fetched into the
 * shared candidate tables, so this source needs no standings mirror, and its
 * global deck feed omits the event id so it is not a data source here.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── playloltcg_shops ───────────────────────────────────────────────────────
  await sql`
    CREATE TABLE playloltcg_shops (
      id integer PRIMARY KEY,
      name text NOT NULL,
      province text,
      city text,
      area text,
      address text,
      longitude double precision,
      latitude double precision,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_playloltcg_shops_name CHECK (length(name) >= 1 AND length(name) <= 200)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON playloltcg_shops
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── playloltcg_events ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE playloltcg_events (
      activity_shop_id bigint PRIMARY KEY,
      shop_id integer REFERENCES playloltcg_shops(id),
      shop_name text,
      name text NOT NULL,
      activity_type text,
      activity_type_name text,
      battle_mode text,
      status smallint,
      start_at date,
      end_at date,
      player_count integer,
      max_user integer,
      fee integer,
      province text,
      city text,
      area text,
      address text,
      longitude double precision,
      latitude double precision,
      content_hash text NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL,
      missing_since timestamptz,
      CONSTRAINT chk_playloltcg_events_name CHECK (length(name) >= 1),
      CONSTRAINT chk_playloltcg_events_content_hash CHECK (content_hash <> ''),
      CONSTRAINT chk_playloltcg_events_player_count CHECK (player_count IS NULL OR player_count >= 0),
      CONSTRAINT chk_playloltcg_events_status CHECK (status IS NULL OR status BETWEEN 1 AND 5)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_playloltcg_events_shop
      ON playloltcg_events (shop_id)
      WHERE shop_id IS NOT NULL
  `.execute(db);

  await sql`CREATE INDEX idx_playloltcg_events_start ON playloltcg_events (start_at)`.execute(db);

  // ── playloltcg_event_checks ────────────────────────────────────────────────
  await sql`
    CREATE TABLE playloltcg_event_checks (
      activity_shop_id bigint PRIMARY KEY
        REFERENCES playloltcg_events(activity_shop_id) ON DELETE CASCADE,
      next_check_at timestamptz,
      check_stage smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_playloltcg_event_checks_stage CHECK (check_stage >= 0)
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON playloltcg_event_checks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    CREATE INDEX idx_playloltcg_event_checks_due
      ON playloltcg_event_checks (next_check_at)
      WHERE next_check_at IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE playloltcg_event_checks`.execute(db);
  await sql`DROP TABLE playloltcg_events`.execute(db);
  await sql`DROP TABLE playloltcg_shops`.execute(db);
}
