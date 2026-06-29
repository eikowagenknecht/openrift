import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 follow-up: removing a participant must take their decklist with them.
// The participant_id FK was ON DELETE SET NULL (a conservative default from
// migration 169), which orphaned the deck-check entry (a deck with no
// participant). No flow deletes a participant except the explicit deny/remove
// paths — claim/link/re-submit only re-point or update the participant row — so
// switching to ON DELETE CASCADE fires only on removal, guaranteeing at the DB
// level that no code path can leave a dangling entry. (entry_cards already
// cascade from the entry.)
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE deck_check_entries DROP CONSTRAINT deck_check_entries_participant_fkey`.execute(
    db,
  );
  await sql`
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT deck_check_entries_participant_fkey
      FOREIGN KEY (participant_id) REFERENCES tournament_participants(id) ON DELETE CASCADE
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE deck_check_entries DROP CONSTRAINT deck_check_entries_participant_fkey`.execute(
    db,
  );
  await sql`
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT deck_check_entries_participant_fkey
      FOREIGN KEY (participant_id) REFERENCES tournament_participants(id) ON DELETE SET NULL
  `.execute(db);
}
