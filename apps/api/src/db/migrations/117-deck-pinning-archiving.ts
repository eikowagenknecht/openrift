import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds support for pinning frequently-used decks to the top of the deck list and
// archiving retired decks so they are hidden by default without being deleted.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("is_pinned", sql`boolean`, (col) => col.notNull().defaultTo(false))
    .addColumn("archived_at", sql`timestamptz`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("is_pinned").dropColumn("archived_at").execute();
}
