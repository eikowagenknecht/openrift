import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tcgplayer_staging_card_overrides")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id"))
    .addColumn("set_id", "text", (col) => col.notNull().references("sets.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("tcgplayer_staging_card_overrides_pkey", ["external_id", "finish"])
    .execute();

  await db.schema
    .createTable("cardmarket_staging_card_overrides")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id"))
    .addColumn("set_id", "text", (col) => col.notNull().references("sets.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("cardmarket_staging_card_overrides_pkey", ["external_id", "finish"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("cardmarket_staging_card_overrides").ifExists().execute();
  await db.schema.dropTable("tcgplayer_staging_card_overrides").ifExists().execute();
}
