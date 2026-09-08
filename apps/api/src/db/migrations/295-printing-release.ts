import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Records when a single printing became available, which `set_releases` cannot
 * express: a promo ships on its own date, often years after the set it is
 * numbered into, and two promos of the same set can differ by months.
 *
 * The pairing and period-start CHECKs are the ones `set_releases` carries, so a
 * coarse precision still stores the first day of its period.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE printings
      ADD COLUMN released_at date,
      ADD COLUMN release_precision release_precision
  `.execute(db);

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT chk_printings_release_precision
        CHECK ((released_at IS NULL) = (release_precision IS NULL)),
      ADD CONSTRAINT chk_printings_release_period_start
        CHECK (
          released_at IS NULL
          OR release_precision = 'day'
          OR (release_precision = 'month' AND EXTRACT(day FROM released_at) = 1)
          OR (
            release_precision = 'quarter'
            AND EXTRACT(day FROM released_at) = 1
            AND EXTRACT(month FROM released_at) IN (1, 4, 7, 10)
          )
          OR (release_precision = 'year' AND EXTRACT(doy FROM released_at) = 1)
        )
  `.execute(db);

  // A view's column list is frozen at creation, so it must be recreated to
  // pick up the two new columns (migration 288 holds the prior body).
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank,
           (t.printing_id IS NOT NULL) AS has_foil_twin
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
    LEFT JOIN mv_printing_foil_twins      t ON t.printing_id = p.id
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW printings_ordered`.execute(db);
  await sql`
    ALTER TABLE printings
      DROP CONSTRAINT chk_printings_release_period_start,
      DROP CONSTRAINT chk_printings_release_precision
  `.execute(db);
  await sql`
    ALTER TABLE printings
      DROP COLUMN release_precision,
      DROP COLUMN released_at
  `.execute(db);
  await sql`
    CREATE VIEW printings_ordered AS
    SELECT p.*,
           COALESCE(r.canonical_rank, 2147483647) AS canonical_rank,
           (t.printing_id IS NOT NULL) AS has_foil_twin
    FROM printings p
    LEFT JOIN mv_printings_canonical_rank r ON r.printing_id = p.id
    LEFT JOIN mv_printing_foil_twins      t ON t.printing_id = p.id
  `.execute(db);
}
