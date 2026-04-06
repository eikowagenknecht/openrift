import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Create card_errata table ──────────────────────────────────────────────
  await db.schema
    .createTable("card_errata")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("card_id", "uuid", (col) => col.notNull().references("cards.id").onDelete("cascade"))
    .addColumn("corrected_rules_text", "text")
    .addColumn("corrected_effect_text", "text")
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("source_url", "text")
    .addColumn("effective_date", "date")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("card_errata_card_id_unique", ["card_id"])
    .addCheckConstraint(
      "chk_card_errata_has_text",
      sql`corrected_rules_text IS NOT NULL OR corrected_effect_text IS NOT NULL`,
    )
    .addCheckConstraint(
      "chk_card_errata_no_empty_corrected_rules_text",
      sql`corrected_rules_text <> ''`,
    )
    .addCheckConstraint(
      "chk_card_errata_no_empty_corrected_effect_text",
      sql`corrected_effect_text <> ''`,
    )
    .addCheckConstraint("chk_card_errata_no_empty_source", sql`source <> ''`)
    .addCheckConstraint("chk_card_errata_no_empty_source_url", sql`source_url <> ''`)
    .execute();

  // ── Migrate existing errata data ──────────────────────────────────────────
  await sql`
    INSERT INTO card_errata (card_id, corrected_rules_text, corrected_effect_text, source)
    SELECT id, rules_text, effect_text, 'Migrated'
    FROM cards
    WHERE rules_text IS NOT NULL OR effect_text IS NOT NULL
  `.execute(db);

  // ── Drop text columns from cards ──────────────────────────────────────────
  await sql`
    ALTER TABLE cards
      DROP CONSTRAINT chk_cards_no_empty_rules_text,
      DROP CONSTRAINT chk_cards_no_empty_effect_text
  `.execute(db);

  await db.schema.alterTable("cards").dropColumn("rules_text").dropColumn("effect_text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Re-add text columns to cards ──────────────────────────────────────────
  await db.schema
    .alterTable("cards")
    .addColumn("rules_text", "text")
    .addColumn("effect_text", "text")
    .execute();

  await sql`
    ALTER TABLE cards
      ADD CONSTRAINT chk_cards_no_empty_rules_text CHECK (rules_text <> ''),
      ADD CONSTRAINT chk_cards_no_empty_effect_text CHECK (effect_text <> '')
  `.execute(db);

  // ── Restore data from card_errata ─────────────────────────────────────────
  await sql`
    UPDATE cards
    SET rules_text = ce.corrected_rules_text,
        effect_text = ce.corrected_effect_text
    FROM card_errata ce
    WHERE cards.id = ce.card_id
  `.execute(db);

  // ── Drop card_errata table ────────────────────────────────────────────────
  await db.schema.dropTable("card_errata").execute();
}
