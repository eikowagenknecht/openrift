import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE tcgplayer_staging_card_overrides (
      external_id integer NOT NULL,
      finish      text NOT NULL,
      card_id     text NOT NULL REFERENCES cards(id),
      set_id      text NOT NULL REFERENCES sets(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (external_id, finish)
    )
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_staging_card_overrides (
      external_id integer NOT NULL,
      finish      text NOT NULL,
      card_id     text NOT NULL REFERENCES cards(id),
      set_id      text NOT NULL REFERENCES sets(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (external_id, finish)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS cardmarket_staging_card_overrides`.execute(db);
  await sql`DROP TABLE IF EXISTS tcgplayer_staging_card_overrides`.execute(db);
}
