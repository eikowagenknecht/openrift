import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printing_events").dropColumn("card_name").execute();
  await db.schema.alterTable("printing_events").dropColumn("set_name").execute();
  await db.schema.alterTable("printing_events").dropColumn("short_code").execute();
  await db.schema.alterTable("printing_events").dropColumn("rarity").execute();
  await db.schema.alterTable("printing_events").dropColumn("finish").execute();
  await db.schema.alterTable("printing_events").dropColumn("artist").execute();
  await db.schema.alterTable("printing_events").dropColumn("language").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printing_events").addColumn("card_name", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("set_name", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("short_code", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("rarity", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("finish", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("artist", "text").execute();
  await db.schema.alterTable("printing_events").addColumn("language", "text").execute();
}
