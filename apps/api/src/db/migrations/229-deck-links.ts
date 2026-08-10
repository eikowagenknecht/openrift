import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Replaces the single YouTube `video_url` (migration 226) with a list of
 * outbound links, each with an optional title: a guide video, the site the
 * list came from. Hosts are allowlisted at the API boundary.
 *
 * Any existing video link carries over as the first entry, so the drop is
 * lossless even though the column shipped only days ago.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("links", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .execute();
  await sql`
    UPDATE decks
    SET links = jsonb_build_array(jsonb_build_object('url', video_url, 'title', 'Video guide'))
    WHERE video_url IS NOT NULL
  `.execute(db);
  await db.schema.alterTable("decks").dropColumn("video_url").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").addColumn("video_url", "text").execute();
  await sql`
    UPDATE decks
    SET video_url = links -> 0 ->> 'url'
    WHERE jsonb_array_length(links) > 0
  `.execute(db);
  await db.schema.alterTable("decks").dropColumn("links").execute();
}
