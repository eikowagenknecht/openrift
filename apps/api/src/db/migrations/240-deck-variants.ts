import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deck variants (ADR-042): a "family" groups full decks that are versions of one
// another. family_id is null for standalone decks and assigned to every member
// when the first copy is made. predecessor_deck_id expresses lineage (checkpoint
// chains and branch points); it self-references decks and detaches on delete so
// removing a middle link never cascades. is_primary marks the variant that
// fronts the family in the deck list, at most one per family. is_draft is a
// lifecycle badge with no behavioral rules.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .addColumn("family_id", "uuid")
    .addColumn("predecessor_deck_id", "uuid")
    .addColumn("is_primary", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_draft", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  await db.schema
    .alterTable("decks")
    .addForeignKeyConstraint("fk_decks_predecessor_deck", ["predecessor_deck_id"], "decks", ["id"])
    .onDelete("set null")
    .execute();

  // A primary only means something inside a family; the partial form also keeps
  // standalone decks (family_id null) out of the index entirely.
  await sql`
    CREATE UNIQUE INDEX uq_decks_family_primary ON decks (family_id) WHERE is_primary AND family_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_decks_family_id ON decks (family_id) WHERE family_id IS NOT NULL
  `.execute(db);

  // The FK needs this side for delete-time lookups (who points at me).
  await sql`
    CREATE INDEX idx_decks_predecessor_deck_id ON decks (predecessor_deck_id) WHERE predecessor_deck_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("decks")
    .dropColumn("family_id")
    .dropColumn("predecessor_deck_id")
    .dropColumn("is_primary")
    .dropColumn("is_draft")
    .execute();
}
