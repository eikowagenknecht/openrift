import type { Kysely } from "kysely";
import { sql } from "kysely";

// Memory for the id sweep: the only way to reach an id the listing endpoint
// refuses to return (an `UNLISTED` or `CANCELED` event, reachable by id alone).
// A sweep must never ask about an id twice. Riftbound ids get no row here —
// they land in `uvsgames_events`, and the sweep's candidate query subtracts
// both tables from the range.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE uvsgames_id_probes (
      external_id bigint PRIMARY KEY,
      outcome text NOT NULL,
      game_type text,
      probed_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_id_probes_external_id CHECK (external_id > 0),
      CONSTRAINT chk_uvsgames_id_probes_outcome
        CHECK (outcome IN ('other_game', 'absent', 'unreadable')),
      CONSTRAINT chk_uvsgames_id_probes_game_type CHECK (game_type IS NULL OR game_type <> '')
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS uvsgames_id_probes`.execute(db);
}
