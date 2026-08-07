import type { Kysely } from "kysely";

/**
 * Per-deck draw-odds settings for the test bench: the owner's custom card
 * groups plus which odds rows the table shows. Stored on the deck (not
 * per device) so the settings travel with the deck and appear on the public
 * share page. NULL means the suggested defaults.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").addColumn("odds_config", "jsonb").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("odds_config").execute();
}
