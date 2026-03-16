import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tcgplayer_ignored_products")
    .addColumn("external_id", "integer", (col) => col.primaryKey())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("cardmarket_ignored_products")
    .addColumn("external_id", "integer", (col) => col.primaryKey())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("cardmarket_ignored_products").ifExists().execute();
  await db.schema.dropTable("tcgplayer_ignored_products").ifExists().execute();
}
