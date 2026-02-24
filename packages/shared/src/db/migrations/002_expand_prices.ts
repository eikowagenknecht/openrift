import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("prices").addColumn("low_cents", "integer").execute();

  await db.schema.alterTable("prices").addColumn("mid_cents", "integer").execute();

  await db.schema.alterTable("prices").addColumn("high_cents", "integer").execute();

  await db.schema.alterTable("prices").addColumn("direct_low_cents", "integer").execute();

  await db.schema.alterTable("prices").addColumn("product_id", "integer").execute();

  await db.schema.alterTable("prices").addColumn("url", "text").execute();

  // Rename price_cents to market_cents for clarity now that we have all fields.
  await db.schema.alterTable("prices").renameColumn("price_cents", "market_cents").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("prices").renameColumn("market_cents", "price_cents").execute();

  await db.schema.alterTable("prices").dropColumn("url").execute();
  await db.schema.alterTable("prices").dropColumn("product_id").execute();
  await db.schema.alterTable("prices").dropColumn("direct_low_cents").execute();
  await db.schema.alterTable("prices").dropColumn("high_cents").execute();
  await db.schema.alterTable("prices").dropColumn("mid_cents").execute();
  await db.schema.alterTable("prices").dropColumn("low_cents").execute();
}
