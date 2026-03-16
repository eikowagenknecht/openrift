import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sets")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  // Seed sort_order based on current alphabetical name order
  await sql`
    UPDATE sets
    SET sort_order = sub.rn
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM sets) sub
    WHERE sets.id = sub.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("sets").dropColumn("sort_order").execute();
}
