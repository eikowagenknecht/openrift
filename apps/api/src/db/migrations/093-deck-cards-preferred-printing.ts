import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds an optional preferred_printing_id to deck_cards so a single card can
// live as multiple rows in a deck (e.g. "1 normal + 2 alt art"), each pinned
// to a specific printing for display. Decks remain card-centric for rules;
// printing is display metadata only.
//
// The unique index is broadened to include preferred_printing_id with
// NULLS NOT DISTINCT (requires PG15+): at most one "default" row per
// (deck, card, zone), plus any number of printing-specific rows.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_cards")
    .addColumn("preferred_printing_id", "uuid", (col) =>
      col.references("printings.id").onDelete("set null"),
    )
    .execute();

  await sql`DROP INDEX IF EXISTS uq_deck_cards`.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_deck_cards
      ON deck_cards (deck_id, card_id, zone, preferred_printing_id)
      NULLS NOT DISTINCT
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_deck_cards`.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_deck_cards
      ON deck_cards (deck_id, card_id, zone)
  `.execute(db);

  await db.schema.alterTable("deck_cards").dropColumn("preferred_printing_id").execute();
}
