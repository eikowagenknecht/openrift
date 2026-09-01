import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Fills in the champion (and any missing legend) every archived list has been
 * carrying in its own zones.
 *
 * No source names a champion beside its standings, so ingest wrote null for it
 * on every row it has ever taken in, while the same row's decklist filed a
 * champion-zone card. The archive's deck tiles and legend pages read the column,
 * not the list, so a champion the archive holds went unshown.
 *
 * Ingest now reads the zone when the source names nothing, which fixes rows as
 * they arrive; this catches up the ones already on file. Both tiers are filled:
 * the overlay (from its own card lines) and the live standings row (from the
 * deck the promotion minted), so a re-promote does not undo it. An overlay's
 * `champion_card_id` is only allowed alongside the matching claim, so the claim
 * is added with the value.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE meta_event_player_overlays AS o
      SET champion_card_id = zone.card_id,
          claimed_fields = CASE
            WHEN 'championCardId' = ANY (o.claimed_fields) THEN o.claimed_fields
            ELSE o.claimed_fields || ARRAY['championCardId']
          END,
          updated_at = now()
      FROM (
        SELECT DISTINCT ON (overlay_id) overlay_id, card_id
        FROM meta_event_player_overlay_cards
        WHERE zone = 'champion' AND card_id IS NOT NULL
        ORDER BY overlay_id, line_number
      ) AS zone
      WHERE zone.overlay_id = o.id AND o.champion_card_id IS NULL
  `.execute(db);

  await sql`
    UPDATE meta_event_player_overlays AS o
      SET legend_card_id = zone.card_id,
          claimed_fields = CASE
            WHEN 'legendCardId' = ANY (o.claimed_fields) THEN o.claimed_fields
            ELSE o.claimed_fields || ARRAY['legendCardId']
          END,
          updated_at = now()
      FROM (
        SELECT DISTINCT ON (overlay_id) overlay_id, card_id
        FROM meta_event_player_overlay_cards
        WHERE zone = 'legend' AND card_id IS NOT NULL
        ORDER BY overlay_id, line_number
      ) AS zone
      WHERE zone.overlay_id = o.id AND o.legend_card_id IS NULL
  `.execute(db);

  await sql`
    UPDATE meta_event_players AS p
      SET champion_card_id = zone.card_id,
          updated_at = now()
      FROM (
        SELECT DISTINCT ON (deck_id) deck_id, card_id
        FROM deck_cards
        WHERE zone = 'champion'
        ORDER BY deck_id
      ) AS zone
      WHERE zone.deck_id = p.deck_id AND p.champion_card_id IS NULL
  `.execute(db);

  await sql`
    UPDATE meta_event_players AS p
      SET legend_card_id = zone.card_id,
          updated_at = now()
      FROM (
        SELECT DISTINCT ON (deck_id) deck_id, card_id
        FROM deck_cards
        WHERE zone = 'legend'
        ORDER BY deck_id
      ) AS zone
      WHERE zone.deck_id = p.deck_id AND p.legend_card_id IS NULL
  `.execute(db);
}

export async function down(): Promise<void> {
  // A backfill of values the lists themselves carry. Emptying the columns again
  // would throw away hand-entered champions alongside the filled ones, and the
  // archive reads a null as "no champion on file", which is what it was.
}
