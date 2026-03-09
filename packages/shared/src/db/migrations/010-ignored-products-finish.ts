import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add finish column to both ignored products tables and change PK to (external_id, finish)
  await sql`
    ALTER TABLE tcgplayer_ignored_products
      DROP CONSTRAINT tcgplayer_ignored_products_pkey,
      ADD COLUMN finish text NOT NULL DEFAULT 'normal',
      ADD PRIMARY KEY (external_id, finish)
  `.execute(db);

  await sql`
    ALTER TABLE cardmarket_ignored_products
      DROP CONSTRAINT cardmarket_ignored_products_pkey,
      ADD COLUMN finish text NOT NULL DEFAULT 'normal',
      ADD PRIMARY KEY (external_id, finish)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cardmarket_ignored_products
      DROP CONSTRAINT cardmarket_ignored_products_pkey,
      DROP COLUMN finish,
      ADD PRIMARY KEY (external_id)
  `.execute(db);

  await sql`
    ALTER TABLE tcgplayer_ignored_products
      DROP CONSTRAINT tcgplayer_ignored_products_pkey,
      DROP COLUMN finish,
      ADD PRIMARY KEY (external_id)
  `.execute(db);
}
