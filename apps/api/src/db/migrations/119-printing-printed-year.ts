import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds the year stamped on the physical card. Differs from `sets.released_at`
// for reprints. Nullable — backfill is manual once printings are verified.
//
// `printings_ordered` projects `p.*`, so its column list is frozen at view
// creation time. Drop and recreate it (definition copied from migration 096)
// so the new column appears in the view too.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);

  await db.schema
    .alterTable("printings")
    .addColumn("printed_year", sql`smallint`)
    .execute();

  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           (row_number() OVER (
             ORDER BY
               l.sort_order,
               s.sort_order,
               p.short_code,
               array_length(p.marker_slugs, 1) IS NOT NULL,
               COALESCE(
                 (SELECT MIN(m.sort_order) FROM markers m
                  WHERE m.slug = ANY(p.marker_slugs)),
                 0
               ),
               f.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets      s ON s.id   = p.set_id
    JOIN finishes  f ON f.slug = p.finish
    JOIN languages l ON l.code = p.language
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);

  await db.schema.alterTable("printings").dropColumn("printed_year").execute();

  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           (row_number() OVER (
             ORDER BY
               l.sort_order,
               s.sort_order,
               p.short_code,
               array_length(p.marker_slugs, 1) IS NOT NULL,
               COALESCE(
                 (SELECT MIN(m.sort_order) FROM markers m
                  WHERE m.slug = ANY(p.marker_slugs)),
                 0
               ),
               f.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets      s ON s.id   = p.set_id
    JOIN finishes  f ON f.slug = p.finish
    JOIN languages l ON l.code = p.language
  `.execute(db);
}
