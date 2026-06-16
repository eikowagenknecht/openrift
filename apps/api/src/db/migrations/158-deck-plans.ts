import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deck plans (ADR-029). An optional, owner-authored plan attached to a deck:
//
//   deck_plans          — 1:1 with a deck; deck-level fields (general strategy,
//                         mulligan notes, one battlefield per scenario).
//   deck_matchup_plans  — zero or more per deck; an opponent Legend + subtitle
//                         and per-matchup notes.
//   deck_matchup_swaps  — the in/out sideboard swaps for a matchup.
//
// Plans reference cards but never touch deck_cards, so deck size/format math is
// untouched. Swap balance and battlefield-in-deck are validated softly in the
// client, not by the DB. The whole feature is gated behind the `deck-plans`
// feature flag in the web app.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. deck_plans (1:1 with a deck) ────────────────────────────────────────
  await db.schema
    .createTable("deck_plans")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull().unique())
    .addColumn("general_strategy", "text", (col) => col.defaultTo("").notNull())
    .addColumn("mulligan_split", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("mulligan_general", "text", (col) => col.defaultTo("").notNull())
    .addColumn("mulligan_first", "text", (col) => col.defaultTo("").notNull())
    .addColumn("mulligan_second", "text", (col) => col.defaultTo("").notNull())
    .addColumn("battlefield_g1_card_id", "uuid")
    .addColumn("battlefield_first_card_id", "uuid")
    .addColumn("battlefield_second_card_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_deck_plans_general_strategy", sql`length(general_strategy) <= 8000`)
    .addCheckConstraint("chk_deck_plans_mulligan_general", sql`length(mulligan_general) <= 4000`)
    .addCheckConstraint("chk_deck_plans_mulligan_first", sql`length(mulligan_first) <= 4000`)
    .addCheckConstraint("chk_deck_plans_mulligan_second", sql`length(mulligan_second) <= 4000`)
    .execute();

  await db.schema
    .alterTable("deck_plans")
    .addForeignKeyConstraint("deck_plans_deck_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  for (const column of [
    "battlefield_g1_card_id",
    "battlefield_first_card_id",
    "battlefield_second_card_id",
  ]) {
    await db.schema
      .alterTable("deck_plans")
      .addForeignKeyConstraint(`deck_plans_${column}_fkey`, [column], "cards", ["id"])
      .onDelete("set null")
      .execute();
  }

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 2. deck_matchup_plans ──────────────────────────────────────────────────
  await db.schema
    .createTable("deck_matchup_plans")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull())
    .addColumn("opponent_legend_card_id", "uuid", (col) => col.notNull())
    .addColumn("subtitle", "text", (col) => col.defaultTo("").notNull())
    .addColumn("notes", "text", (col) => col.defaultTo("").notNull())
    .addColumn("sort_order", "smallint", (col) => col.defaultTo(0).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_deck_matchup_plans_subtitle", sql`length(subtitle) <= 120`)
    .addCheckConstraint("chk_deck_matchup_plans_notes", sql`length(notes) <= 4000`)
    // Empty-string default (never NULL) so this uniqueness actually holds — a
    // NULL subtitle would let duplicate same-Legend matchups slip through.
    .addUniqueConstraint("uq_deck_matchup_plans_deck_legend_subtitle", [
      "deck_id",
      "opponent_legend_card_id",
      "subtitle",
    ])
    .execute();

  await db.schema
    .alterTable("deck_matchup_plans")
    .addForeignKeyConstraint("deck_matchup_plans_deck_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
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
    .createIndex("idx_deck_matchup_plans_deck")
    .on("deck_matchup_plans")
    .column("deck_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_matchup_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. deck_matchup_swaps ──────────────────────────────────────────────────
  await db.schema
    .createTable("deck_matchup_swaps")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("plan_id", "uuid", (col) => col.notNull())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("direction", "text", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull())
    .addCheckConstraint("chk_deck_matchup_swaps_direction", sql`direction IN ('in', 'out')`)
    .addCheckConstraint("chk_deck_matchup_swaps_quantity", sql`quantity > 0`)
    .addUniqueConstraint("uq_deck_matchup_swaps_plan_card_direction", [
      "plan_id",
      "card_id",
      "direction",
    ])
    .execute();

  await db.schema
    .alterTable("deck_matchup_swaps")
    .addForeignKeyConstraint("deck_matchup_swaps_plan_fkey", ["plan_id"], "deck_matchup_plans", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_matchup_swaps")
    .addForeignKeyConstraint("deck_matchup_swaps_card_fkey", ["card_id"], "cards", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_deck_matchup_swaps_plan")
    .on("deck_matchup_swaps")
    .column("plan_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("deck_matchup_swaps").execute();
  await db.schema.dropTable("deck_matchup_plans").execute();
  await db.schema.dropTable("deck_plans").execute();
}
