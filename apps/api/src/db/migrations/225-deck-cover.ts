import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Custom deck cover art: the owner may pick any card in the deck as the
 * hero/tile backdrop instead of the auto-derived legend art, optionally
 * pinning a printing and a vertical crop focus (0-100, percent from the top).
 * All NULL means the legend-derived default. FKs SET NULL so a deleted
 * card or printing can't leave a dangling cover.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("cover_card_id", "uuid", (col) => col.references("cards.id").onDelete("set null"))
    .execute();
  await db.schema
    .alterTable("decks")
    .addColumn("cover_printing_id", "uuid", (col) =>
      col.references("printings.id").onDelete("set null"),
    )
    .execute();
  await db.schema
    .alterTable("decks")
    .addColumn("cover_position", "smallint", (col) =>
      col.check(sql`cover_position BETWEEN 0 AND 100`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("cover_position").execute();
  await db.schema.alterTable("decks").dropColumn("cover_printing_id").execute();
  await db.schema.alterTable("decks").dropColumn("cover_card_id").execute();
}
