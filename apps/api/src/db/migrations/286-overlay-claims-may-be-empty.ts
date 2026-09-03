import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Lets an overlay claim nothing. Linking drops the claims the target already
 * agrees with, and an upload the sources fully agree with keeps only its
 * source key and the standings overlays under it.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_overlays
      DROP CONSTRAINT chk_meta_event_overlays_claimed_nonempty
  `.execute(db);

  await sql`
    ALTER TABLE meta_event_player_overlays
      DROP CONSTRAINT chk_meta_event_player_overlays_claimed_nonempty
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_event_overlays
      ADD CONSTRAINT chk_meta_event_overlays_claimed_nonempty
      CHECK (cardinality(claimed_fields) > 0)
  `.execute(db);

  await sql`
    ALTER TABLE meta_event_player_overlays
      ADD CONSTRAINT chk_meta_event_player_overlays_claimed_nonempty
      CHECK (cardinality(claimed_fields) > 0)
  `.execute(db);
}
