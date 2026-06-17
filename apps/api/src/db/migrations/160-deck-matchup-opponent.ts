import type { Kysely } from "kysely";
import { sql } from "kysely";

// Broadens a matchup's opponent identity (ADR-029). Originally a matchup was a
// required Legend card; in practice you also plan against a domain, a single
// card (Aurora), or an archetype (Aggro / Control / Ramp / …) where no Legend
// applies. A matchup is now identified by an optional linked card (any type,
// for the icon + catalog link) plus a free-text label, with a CHECK that at
// least one is present. The old `subtitle` build-name field is folded into the
// label, and the (deck, legend, subtitle) uniqueness is dropped — two matchups
// may share a name.
export async function up(db: Kysely<unknown>): Promise<void> {
  // The card link becomes optional and points at any card, so a deleted card
  // nulls the link instead of cascading the whole matchup away.
  await db.schema
    .alterTable("deck_matchup_plans")
    .dropConstraint("deck_matchup_plans_legend_fkey")
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .renameColumn("opponent_legend_card_id", "opponent_card_id")
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .alterColumn("opponent_card_id", (col) => col.dropNotNull())
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .addForeignKeyConstraint("deck_matchup_plans_card_fkey", ["opponent_card_id"], "cards", ["id"])
    .onDelete("set null")
    .execute();

  // Free-text label; subtitle folds into it (the build name was always a label).
  await db.schema
    .alterTable("deck_matchup_plans")
    .addColumn("opponent_label", "text", (col) => col.defaultTo("").notNull())
    .execute();

  await sql`
    UPDATE deck_matchup_plans SET opponent_label = subtitle WHERE subtitle <> ''
  `.execute(db);

  // (deck, legend, subtitle) uniqueness no longer makes sense once the card is
  // optional and the label is free text; ordering handles duplicates instead.
  await db.schema
    .alterTable("deck_matchup_plans")
    .dropConstraint("uq_deck_matchup_plans_deck_legend_subtitle")
    .execute();

  await db.schema.alterTable("deck_matchup_plans").dropColumn("subtitle").execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .addCheckConstraint("chk_deck_matchup_plans_label", sql`length(opponent_label) <= 120`)
    .execute();

  // A matchup must be identifiable: a linked card, a label, or both.
  await db.schema
    .alterTable("deck_matchup_plans")
    .addCheckConstraint(
      "chk_deck_matchup_plans_identity",
      sql`opponent_card_id IS NOT NULL OR opponent_label <> ''`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_matchup_plans")
    .dropConstraint("chk_deck_matchup_plans_identity")
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .dropConstraint("chk_deck_matchup_plans_label")
    .execute();

  // Restore the build-name column from the label before dropping it.
  await db.schema
    .alterTable("deck_matchup_plans")
    .addColumn("subtitle", "text", (col) => col.defaultTo("").notNull())
    .execute();

  await sql`UPDATE deck_matchup_plans SET subtitle = opponent_label`.execute(db);

  await db.schema.alterTable("deck_matchup_plans").dropColumn("opponent_label").execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .dropConstraint("deck_matchup_plans_card_fkey")
    .execute();

  // Drop rows that can't satisfy the old NOT NULL before re-adding it.
  await sql`DELETE FROM deck_matchup_plans WHERE opponent_card_id IS NULL`.execute(db);

  await db.schema
    .alterTable("deck_matchup_plans")
    .alterColumn("opponent_card_id", (col) => col.setNotNull())
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .renameColumn("opponent_card_id", "opponent_legend_card_id")
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .addForeignKeyConstraint(
      "deck_matchup_plans_legend_fkey",
      ["opponent_legend_card_id"],
      "cards",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .addUniqueConstraint("uq_deck_matchup_plans_deck_legend_subtitle", [
      "deck_id",
      "opponent_legend_card_id",
      "subtitle",
    ])
    .execute();
}
