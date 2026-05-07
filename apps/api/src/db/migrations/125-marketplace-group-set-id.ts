import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("marketplace_groups")
    .addColumn("set_id", "uuid", (col) => col.references("sets.id").onDelete("set null"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("marketplace_groups").dropColumn("set_id").execute();
}
