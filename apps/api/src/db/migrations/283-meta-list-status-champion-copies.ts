import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Backfills `list_status = 'full'` for lists marked partial only because a
 * champion playset (2-3 copies filed under `champion`) left `main` short of
 * its floor. Superseded by 285, which repairs the stored zones themselves;
 * this migration only touches the status.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE meta_event_players AS p
      SET list_status = 'full',
          updated_at = now()
      FROM (
        SELECT deck_id,
               sum(quantity) FILTER (WHERE zone = 'legend') AS legend,
               sum(quantity) FILTER (WHERE zone = 'champion') AS champion,
               sum(quantity) FILTER (WHERE zone = 'runes') AS runes,
               sum(quantity) FILTER (WHERE zone = 'battlefield') AS battlefield,
               sum(quantity) FILTER (WHERE zone = 'main') AS main
        FROM deck_cards
        GROUP BY deck_id
      ) AS held
      WHERE held.deck_id = p.deck_id
        AND p.list_status = 'partial'
        AND coalesce(held.legend, 0) >= 1
        AND coalesce(held.champion, 0) >= 1
        AND coalesce(held.runes, 0) >= 12
        AND coalesce(held.battlefield, 0) >= 3
        AND coalesce(held.main, 0) + coalesce(held.champion, 0) >= 40
  `.execute(db);
}

export async function down(): Promise<void> {
  // Re-marking these partial would restore a claim that was never true.
}
