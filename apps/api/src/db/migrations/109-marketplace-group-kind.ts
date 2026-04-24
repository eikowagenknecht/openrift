import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create type marketplace_group_kind as enum ('basic', 'special')
  `.execute(db);

  await db.schema
    .alterTable("marketplace_groups")
    .addColumn("group_kind", sql`marketplace_group_kind`, (col) => col.notNull().defaultTo("basic"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("marketplace_groups").dropColumn("group_kind").execute();
  await sql`drop type marketplace_group_kind`.execute(db);
}
