import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_tcgplayer_staging_set_id").execute();
  await db.schema.alterTable("tcgplayer_staging").dropColumn("set_id").execute();

  await db.schema.dropIndex("idx_cardmarket_staging_set_id").execute();
  await db.schema.alterTable("cardmarket_staging").dropColumn("set_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tcgplayer_staging")
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .execute();
  await db.schema
    .createIndex("idx_tcgplayer_staging_set_id")
    .on("tcgplayer_staging")
    .column("set_id")
    .execute();

  await db.schema
    .alterTable("cardmarket_staging")
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .execute();
  await db.schema
    .createIndex("idx_cardmarket_staging_set_id")
    .on("cardmarket_staging")
    .column("set_id")
    .execute();
}
