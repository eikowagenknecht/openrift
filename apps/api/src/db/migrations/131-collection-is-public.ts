import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds the public-visibility flag for collection sharing. share_token already
// exists on the collections table; is_public lets us revoke a share without
// rotating the token and matches the decks table's sharing model.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("collections")
    .addColumn("is_public", sql`boolean`, (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("collections").dropColumn("is_public").execute();
}
