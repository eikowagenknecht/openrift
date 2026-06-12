import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds a parent publish-the-deck-list consent above the granular name / Riot ID
// flags from migration 153. Default true (opt-out model), matching the existing
// flags. Entries that already refused both name and Riot ID descend from
// ADR-025's whole-entry opt-out, so they never wanted publication: start them
// at false to preserve that refusal.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("allow_deck_publishing", "boolean", (col) => col.defaultTo(true).notNull())
    .execute();

  await sql`
    UPDATE deck_check_entries
       SET allow_deck_publishing = false
     WHERE NOT allow_name_sharing AND NOT allow_riot_id_sharing
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("deck_check_entries").dropColumn("allow_deck_publishing").execute();
}
