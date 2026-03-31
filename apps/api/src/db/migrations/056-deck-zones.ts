import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deck_cards
      DROP CONSTRAINT chk_deck_cards_zone,
      ADD CONSTRAINT chk_deck_cards_zone
        CHECK (zone = ANY (ARRAY['main', 'sideboard', 'legend', 'champion', 'runes', 'battlefield', 'overflow']))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove rows with new zone values before restoring the old constraint
  await sql`DELETE FROM deck_cards WHERE zone NOT IN ('main', 'sideboard')`.execute(db);

  await sql`
    ALTER TABLE deck_cards
      DROP CONSTRAINT chk_deck_cards_zone,
      ADD CONSTRAINT chk_deck_cards_zone
        CHECK (zone = ANY (ARRAY['main', 'sideboard']))
  `.execute(db);
}
