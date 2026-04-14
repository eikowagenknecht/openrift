import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("promo_types")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  // Backfill existing rows with alphabetical order by label.
  await sql`
    update promo_types
    set sort_order = ranked.new_order
    from (
      select id, (row_number() over (order by label) - 1)::int as new_order
      from promo_types
    ) as ranked
    where promo_types.id = ranked.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("promo_types").dropColumn("sort_order").execute();
}
