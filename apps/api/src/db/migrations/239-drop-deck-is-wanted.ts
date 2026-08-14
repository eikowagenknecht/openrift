import type { Kysely } from "kysely";

/**
 * Drops `decks.is_wanted`, the "want to build" flag from ADR-005.
 *
 * It was meant to feed a shopping list: a wanted deck's card requirements
 * would become virtual demand, counted against copies in collections
 * available for deck building. That shopping list was never built, so nothing
 * ever read the flag — no UI set it, and every row is `false`. The deck page's
 * missing-cards dialog covers the "what am I short?" question per deck instead.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("is_wanted").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("is_wanted", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}
