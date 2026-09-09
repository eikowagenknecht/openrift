import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE friend_group_shops (
      group_id uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
      uvsgames_store_id integer NOT NULL REFERENCES uvsgames_stores(id) ON DELETE CASCADE,
      added_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, uvsgames_store_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_friend_group_shops_store ON friend_group_shops (uvsgames_store_id)
  `.execute(db);

  await sql`
    CREATE INDEX idx_uvsgames_events_store_start ON uvsgames_events (store_id, start_at)
      WHERE store_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_uvsgames_events_store_start`.execute(db);
  await sql`DROP TABLE friend_group_shops`.execute(db);
}
