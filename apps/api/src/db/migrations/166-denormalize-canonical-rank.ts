import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-027 catalog vertical: denormalize the printing canonical sort rank.
//
// `canonical_rank` used to be computed on read by the `printings_ordered`
// view via a `row_number() OVER (...)` window. That works for the server-side
// /catalog endpoint, but the catalog is now also synced to the client via
// Electric shapes, which replicate plain `printings` rows — a window function
// in a view can't ride along. So we store the rank as a real column.
//
// `recompute_printing_canonical_ranks()` reruns the exact same ordering (copied
// verbatim from migration 119 / the schema snapshot) and writes the result back
// into `printings.canonical_rank`. Every write path that changes an ordering
// input (printing insert/update/delete, marker/set/finish/language reorder)
// calls this function once at the end of its transaction. The view becomes a
// passthrough so existing Kysely consumers keep reading `canonical_rank`.
//
// The column is nullable: a fresh insert leaves it NULL until the recompute in
// the same transaction populates it, so external readers never see a NULL row.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("printings")
    .addColumn("canonical_rank", sql`integer`)
    .execute();

  // The function body's ORDER BY must stay byte-for-byte identical to the old
  // view (migration 119) so the stored ranks match what the view produced.
  // `IS DISTINCT FROM` keeps the UPDATE to only the rows whose rank actually
  // changed, minimizing replication churn into the Electric shape.
  await sql`
    CREATE OR REPLACE FUNCTION recompute_printing_canonical_ranks()
    RETURNS void
    LANGUAGE sql
    AS $$
      UPDATE printings p
      SET canonical_rank = r.rn
      FROM (
        SELECT p.id,
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
               ))::int AS rn
        FROM printings p
        JOIN sets      s ON s.id   = p.set_id
        JOIN finishes  f ON f.slug = p.finish
        JOIN languages l ON l.code = p.language
      ) r
      WHERE p.id = r.id
        AND p.canonical_rank IS DISTINCT FROM r.rn;
    $$;
  `.execute(db);

  // Backfill the brand-new column from the function.
  await sql`SELECT recompute_printing_canonical_ranks()`.execute(db);

  // Recreate the view as a passthrough that reads the stored column. The view's
  // column list froze at its original creation (see migration 119's comment), so
  // adding `canonical_rank` to `printings` requires a drop + recreate for the
  // column to appear. `SELECT *` now already exposes `canonical_rank`, so every
  // existing Kysely consumer keeps working unchanged.
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);
  await sql`CREATE VIEW printings_ordered AS SELECT * FROM printings`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop the passthrough view first (it depends on the column).
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);

  await db.schema.alterTable("printings").dropColumn("canonical_rank").execute();

  await sql`DROP FUNCTION IF EXISTS recompute_printing_canonical_ranks()`.execute(db);

  // Recreate the original computing view (definition from migration 119).
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
