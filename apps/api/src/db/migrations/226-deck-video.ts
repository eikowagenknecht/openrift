import type { Kysely } from "kysely";

/**
 * Optional video guide link on a deck. YouTube-only, validated at the API
 * boundary; rendered as a "Watch deck guide" chip on the deck page and the
 * public share page.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").addColumn("video_url", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("video_url").execute();
}
