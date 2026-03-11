import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tcgplayer_ignored_products")
    .dropConstraint("tcgplayer_ignored_products_pkey")
    .execute();
  await db.schema
    .alterTable("tcgplayer_ignored_products")
    .addColumn("finish", "text", (col) => col.notNull().defaultTo("normal"))
    .execute();
  await db.schema
    .alterTable("tcgplayer_ignored_products")
    .addPrimaryKeyConstraint("tcgplayer_ignored_products_pkey", ["external_id", "finish"])
    .execute();

  await db.schema
    .alterTable("cardmarket_ignored_products")
    .dropConstraint("cardmarket_ignored_products_pkey")
    .execute();
  await db.schema
    .alterTable("cardmarket_ignored_products")
    .addColumn("finish", "text", (col) => col.notNull().defaultTo("normal"))
    .execute();
  await db.schema
    .alterTable("cardmarket_ignored_products")
    .addPrimaryKeyConstraint("cardmarket_ignored_products_pkey", ["external_id", "finish"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("cardmarket_ignored_products")
    .dropConstraint("cardmarket_ignored_products_pkey")
    .execute();
  await db.schema.alterTable("cardmarket_ignored_products").dropColumn("finish").execute();
  await db.schema
    .alterTable("cardmarket_ignored_products")
    .addPrimaryKeyConstraint("cardmarket_ignored_products_pkey", ["external_id"])
    .execute();

  await db.schema
    .alterTable("tcgplayer_ignored_products")
    .dropConstraint("tcgplayer_ignored_products_pkey")
    .execute();
  await db.schema.alterTable("tcgplayer_ignored_products").dropColumn("finish").execute();
  await db.schema
    .alterTable("tcgplayer_ignored_products")
    .addPrimaryKeyConstraint("tcgplayer_ignored_products_pkey", ["external_id"])
    .execute();
}
