import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * `printings_ordered` projects every column of `printings` plus a single
 * integer `canonical_rank` that encodes the default sort order:
 *
 *   1. language.sort_order        (DB-default language; per-user preference
 *                                   overrides this axis client-side)
 *   2. set.sort_order
 *   3. short_code
 *   4. has any markers (unmarked before marked)
 *   5. primary marker sort_order  (MIN over the printing's marker_slugs, so a
 *                                   "promo" marker with sort_order=1 ranks
 *                                   before a "champion" marker with 5)
 *   6. finish.sort_order
 *
 * Computed on read (plain view, not materialised) so admin reorders of any
 * reference table take effect on the next /catalog fetch with no refresh step.
 *
 * @returns Resolves once the view is created.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
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
}
