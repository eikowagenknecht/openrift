import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sets")
    .addColumn("released", sql`boolean`, (col) => col.notNull().defaultTo(true))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("sets").dropColumn("released").execute();
}
