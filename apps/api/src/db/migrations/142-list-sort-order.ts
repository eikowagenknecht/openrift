import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("lists")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  // Backfill so the initial visible order matches the existing creation
  // order: ranked per (user, intent) bucket since the sidebar groups by
  // intent and we reorder within each bucket.
  await sql`
    update lists
    set sort_order = ranked.new_order
    from (
      select id, (row_number() over (
        partition by user_id, intent order by created_at, id
      ) - 1)::int as new_order
      from lists
    ) as ranked
    where lists.id = ranked.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("lists").dropColumn("sort_order").execute();
}
