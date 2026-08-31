import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Overlay card lines carry the preferred printing, so an admin's pasted deck
 * code keeps its exact printings through the overlay layer instead of losing
 * them to promotion's null default.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_player_overlay_cards
      ADD COLUMN preferred_printing_id uuid REFERENCES printings(id) ON DELETE SET NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_player_overlay_cards DROP COLUMN preferred_printing_id
  `.execute(db);
}
