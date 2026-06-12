import type { Kysely } from "kysely";
import { sql } from "kysely";

// Renames deck_check_entries.player_handle to riot_id. The field always held a
// player's Riot ID, but the generic "handle" name made it undiscoverable to
// organizers pushing entries (and to judges editing them). The column, its
// length check constraint, and the API/JSON key are all renamed to riot_id.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_player_handle")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .renameColumn("player_handle", "riot_id")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_riot_id",
      sql`riot_id IS NULL OR length(riot_id) <= 120`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_riot_id")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .renameColumn("riot_id", "player_handle")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_player_handle",
      sql`player_handle IS NULL OR length(player_handle) <= 120`,
    )
    .execute();
}
