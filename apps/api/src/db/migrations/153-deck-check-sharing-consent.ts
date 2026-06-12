import type { Kysely } from "kysely";
import { sql } from "kysely";

// Granular sharing consent for deck-check entries. Replaces ADR-025's single
// `publish_opt_out` passthrough with one flag per shared field (player name,
// Riot ID), default true (opt-out model). Entries that had opted out keep
// their refusal: both new flags start false for them.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("allow_name_sharing", "boolean", (col) => col.defaultTo(true).notNull())
    .addColumn("allow_riot_id_sharing", "boolean", (col) => col.defaultTo(true).notNull())
    .execute();

  await sql`
    UPDATE deck_check_entries
       SET allow_name_sharing = false,
           allow_riot_id_sharing = false
     WHERE publish_opt_out
  `.execute(db);

  await db.schema.alterTable("deck_check_entries").dropColumn("publish_opt_out").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("publish_opt_out", "boolean", (col) => col.defaultTo(false).notNull())
    .execute();

  // Lossy reverse mapping: a full refusal becomes the old whole-entry opt-out.
  await sql`
    UPDATE deck_check_entries
       SET publish_opt_out = true
     WHERE NOT allow_name_sharing AND NOT allow_riot_id_sharing
  `.execute(db);

  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("allow_name_sharing")
    .dropColumn("allow_riot_id_sharing")
    .execute();
}
