import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The day a promo was first shown, which the release date cannot express: a
 * promo is often announced months before it is handed out, and the gap is the
 * fact the desk wants to record.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE printings ADD COLUMN announced_at date`.execute(db);

  // A view's column list is frozen at creation, so it must be recreated to
  // pick up the new column (migration 295 holds the prior body).
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
  await sql`ALTER TABLE printings DROP COLUMN announced_at`.execute(db);
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
