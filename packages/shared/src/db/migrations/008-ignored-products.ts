import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE tcgplayer_ignored_products (
      external_id  integer PRIMARY KEY,
      product_name text NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_ignored_products (
      external_id  integer PRIMARY KEY,
      product_name text NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS cardmarket_ignored_products`.execute(db);
  await sql`DROP TABLE IF EXISTS tcgplayer_ignored_products`.execute(db);
}
