import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Settles the ledger rows and credits behind submissions that were accepted
 * while the accept path wrote neither. Their overlays were applied and their
 * decks are on the archive, but the contributor's own page still reads
 * "waiting for review" and the event names nobody.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE meta_submissions AS s
      SET status = 'accepted',
          resolved_at = o.accepted_at,
          accepted_deck_id = p.deck_id,
          updated_at = now()
      FROM meta_event_player_overlays AS o
      LEFT JOIN meta_event_players AS p ON p.id = o.meta_event_player_id
      WHERE o.id = s.player_overlay_id
        AND o.status = 'accepted'
        AND s.status = 'pending'
  `.execute(db);

  await sql`
    INSERT INTO meta_credits (meta_event_id, meta_event_player_id, user_id)
      SELECT coalesce(p.meta_event_id, o.meta_event_id), o.meta_event_player_id, s.user_id
      FROM meta_submissions AS s
      JOIN meta_event_player_overlays AS o ON o.id = s.player_overlay_id
      LEFT JOIN meta_event_players AS p ON p.id = o.meta_event_player_id
      WHERE s.status = 'accepted'
        AND coalesce(p.meta_event_id, o.meta_event_id) IS NOT NULL
      ON CONFLICT (meta_event_id, user_id, meta_event_player_id) DO NOTHING
  `.execute(db);
}

export async function down(): Promise<void> {
  // Reverting would take back outcomes and credits that are correct.
}
