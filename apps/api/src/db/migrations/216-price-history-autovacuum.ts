import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Tighten autovacuum's analyze trigger on `marketplace_product_prices`.
 *
 * The table is append-only history: the price-refresh crons add a row per
 * product per run, so it grows without bound while the default
 * `autovacuum_analyze_scale_factor` of 0.1 only re-analyzes after 10% of the
 * table has changed. At ~890k rows that threshold is ~89k inserts, and
 * production was observed sitting at 85,359 modifications with statistics 265
 * hours (11 days) old — stale planner input for the biggest table in the
 * database, getting worse as it grows because the threshold scales with it.
 *
 * 0.02 with a 5k floor keeps analyze running on the order of a day's inserts
 * regardless of table size. Vacuum is left at its default: the table is
 * insert-only, so there are no dead tuples to chase.
 *
 * @returns Resolves once the storage parameters are set.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_product_prices SET (
      autovacuum_analyze_scale_factor = 0.02,
      autovacuum_analyze_threshold = 5000
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_product_prices RESET (
      autovacuum_analyze_scale_factor,
      autovacuum_analyze_threshold
    )
  `.execute(db);
}
