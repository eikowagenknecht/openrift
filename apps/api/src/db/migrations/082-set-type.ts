import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create type set_type as enum ('main', 'supplemental')
  `.execute(db);

  await db.schema
    .alterTable("sets")
    .addColumn("set_type", sql`set_type`, (col) => col.notNull().defaultTo("main"))
    .execute();

  // Backfill known supplemental sets
  await sql`
    update sets set set_type = 'supplemental' where slug in ('OGS', 'ARC')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("sets").dropColumn("set_type").execute();
  await sql`drop type set_type`.execute(db);
}
