import type { Kysely } from "kysely";

/**
 * A deck's home collection: the physical box the deck lives in. Copies in that
 * collection always count as buildable for this deck, even when the collection
 * is excluded from deck building for everything else. Nullable (no home box by
 * default), not unique (several decks may share one box), FK SET NULL so a
 * deleted collection just clears the link.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("collection_id", "uuid", (col) =>
      col.references("collections.id").onDelete("set null"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("decks").dropColumn("collection_id").execute();
}
