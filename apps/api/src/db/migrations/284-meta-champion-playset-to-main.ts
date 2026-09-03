import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Moves a champion playset's overflow (quantity > 1) into the main deck; the
 * Chosen Champion zone holds exactly one card, and playloltcg files whole
 * playsets there. Repairs what 283 could not: that migration only fixed
 * `list_status`, this fixes `deck_cards`. The overflow folds into an existing
 * main-deck line for the same card (`uq_deck_cards`) or gets its own.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    WITH surplus AS (
      SELECT id, deck_id, card_id, preferred_printing_id, quantity - 1 AS moved
      FROM deck_cards
      WHERE zone = 'champion' AND quantity > 1
    ),
    folded AS (
      UPDATE deck_cards AS d
        SET quantity = d.quantity + surplus.moved,
            updated_at = now()
        FROM surplus
        WHERE d.deck_id = surplus.deck_id
          AND d.card_id = surplus.card_id
          AND d.zone = 'main'
          AND d.preferred_printing_id IS NOT DISTINCT FROM surplus.preferred_printing_id
        RETURNING surplus.id
    ),
    inserted AS (
      INSERT INTO deck_cards (deck_id, card_id, zone, quantity, preferred_printing_id)
      SELECT deck_id, card_id, 'main', moved, preferred_printing_id
      FROM surplus
      WHERE id NOT IN (SELECT id FROM folded)
    )
    UPDATE deck_cards
      SET quantity = 1,
          updated_at = now()
      WHERE id IN (SELECT id FROM surplus)
  `.execute(db);

  // A repaired list reaches its main-deck floor, so the marker it was published
  // under no longer describes it.
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
        AND coalesce(held.main, 0) >= 39
  `.execute(db);
}

export async function down(): Promise<void> {
  // Restoring a playset to a one-card zone would restore the defect.
}
