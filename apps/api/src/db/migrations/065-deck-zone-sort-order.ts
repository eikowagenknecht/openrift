import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update deck_zones
    set sort_order = d.new_order
    from (values
      ('legend'::text,      0::int),
      ('champion'::text,    1::int),
      ('main'::text,        2::int),
      ('battlefield'::text, 3::int),
      ('runes'::text,       4::int),
      ('sideboard'::text,   5::int),
      ('overflow'::text,    6::int)
    ) as d(slug, new_order)
    where deck_zones.slug = d.slug
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    update deck_zones
    set sort_order = d.new_order
    from (values
      ('main'::text,        0::int),
      ('sideboard'::text,   1::int),
      ('legend'::text,      2::int),
      ('champion'::text,    3::int),
      ('runes'::text,       4::int),
      ('battlefield'::text, 5::int),
      ('overflow'::text,    6::int)
    ) as d(slug, new_order)
    where deck_zones.slug = d.slug
  `.execute(db);
}
