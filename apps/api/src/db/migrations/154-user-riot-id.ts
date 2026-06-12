import type { Kysely } from "kysely";

// Adds a free-text Riot ID (gameName#tagLine) to the users table. NULL = not
// set. Self-reported display data, never an identity key; copied onto
// self-submitted deck-check entries at creation. See ADR-028.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").addColumn("riot_id", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("riot_id").execute();
}
