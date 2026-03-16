import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Add CHECK constraints that validate individual array elements for
 * `domains` and `super_types` on the `cards` table.
 *
 * Postgres supports this via array-containment (`<@`): the column value
 * must be a subset of the allowed values array.
 *
 * Note: `card_sources` is intentionally excluded — it holds raw data from
 * external sources that may contain invalid/delimited values.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards
    ADD CONSTRAINT chk_cards_domains_values
      CHECK (domains <@ ARRAY['Fury','Calm','Mind','Body','Chaos','Order','Colorless']::text[])
  `.execute(db);

  await sql`
    ALTER TABLE cards
    ADD CONSTRAINT chk_cards_super_types_values
      CHECK (super_types <@ ARRAY['Basic','Champion','Signature','Token']::text[])
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_super_types_values`.execute(db);
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_domains_values`.execute(db);
}
