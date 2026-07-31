import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Move `printings_ordered.canonical_rank` off the read path.
 *
 * Migration 096 computed the rank inline with `row_number() OVER (...)` so
 * reference-table reorders needed no refresh step. The cost of that is a
 * global window: because the ranking has no `PARTITION BY`, PostgreSQL cannot
 * push a `WHERE` through it, so *every* query against the view sorts the whole
 * printings table even when it asks for a handful of cards. `catalog.ts`
 * already worked around this once (`printingsByCardId` re-implements the
 * ordering over the filtered subset); in production the remaining view reads
 * averaged ~100ms each.
 *
 * The rank now lives in a materialized view keyed by printing, and
 * `printings_ordered` is a plain lookup join against it. Ordering semantics are
 * unchanged — same expression, same global 1..N integers, which the wire
 * contract requires (`canonicalRank: z.number().int()`).
 *
 * Staleness is deliberately graceful rather than exact: a printing with no rank
 * row yet coalesces to the largest int, so it sorts *last* instead of vanishing
 * from the view. A missed refresh therefore delays ordering, and never drops a
 * printing. Refresh happens wherever `mv_card_aggregates` is already refreshed
 * plus the reference tables that feed the ranking (sets, finishes, card_sizes,
 * languages, markers).
 *
 * @returns Resolves once the materialized view and the rewritten view exist.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE MATERIALIZED VIEW mv_printings_canonical_rank AS
    SELECT p.id AS printing_id,
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
               f.sort_order,
               cs.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets       s  ON s.id   = p.set_id
    JOIN finishes   f  ON f.slug = p.finish
    JOIN card_sizes cs ON cs.slug = p.size
    JOIN languages  l  ON l.code = p.language
  `.execute(db);

  // REFRESH ... CONCURRENTLY requires a unique index on the view.
  await sql`
    CREATE UNIQUE INDEX idx_mv_printings_canonical_rank_pk
      ON mv_printings_canonical_rank (printing_id)
  `.execute(db);

  await sql`DROP VIEW printings_ordered`.execute(db);

  // The reference joins are gone: every one of them was on a NOT NULL column
  // backed by a foreign key, so they only ever existed to reach `sort_order`
  // for the ranking and never filtered a row out.
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS printings_ordered`.execute(db);
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_printings_canonical_rank`.execute(db);
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
               f.sort_order,
               cs.sort_order
           ))::int AS canonical_rank
    FROM printings p
    JOIN sets       s  ON s.id   = p.set_id
    JOIN finishes   f  ON f.slug = p.finish
    JOIN card_sizes cs ON cs.slug = p.size
    JOIN languages  l  ON l.code = p.language
  `.execute(db);
}
