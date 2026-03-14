import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Make remaining text columns nullable and remove empty-string defaults.
 * "No info" is represented as NULL, not ''.
 *
 * - cards.effect_text: drop stale DEFAULT ''
 * - card_sources.effect_text: NOT NULL DEFAULT '' → nullable
 * - printings.printed_rules_text: NOT NULL → nullable
 * - Convert existing '' to NULL in all affected columns
 * - Add CHECK constraints to prevent empty strings
 * - Add CHECK constraint: cards.domains must not be empty
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── cards.effect_text: drop the stale DEFAULT '' left over from 001 ────────
  await sql`ALTER TABLE cards ALTER COLUMN effect_text DROP DEFAULT`.execute(db);
  await sql`UPDATE cards SET effect_text = NULL WHERE effect_text = ''`.execute(db);
  await sql`UPDATE cards SET rules_text = NULL WHERE rules_text = ''`.execute(db);

  // ── card_sources.effect_text: NOT NULL DEFAULT '' → nullable ───────────────
  await db.schema
    .alterTable("card_sources")
    .alterColumn("effect_text", (col) => col.dropNotNull())
    .execute();
  await sql`ALTER TABLE card_sources ALTER COLUMN effect_text DROP DEFAULT`.execute(db);
  await sql`UPDATE card_sources SET effect_text = NULL WHERE effect_text = ''`.execute(db);
  await sql`UPDATE card_sources SET rules_text = NULL WHERE rules_text = ''`.execute(db);

  // ── printings.printed_rules_text: NOT NULL → nullable ─────────────────────
  await db.schema
    .alterTable("printings")
    .alterColumn("printed_rules_text", (col) => col.dropNotNull())
    .execute();
  await sql`UPDATE printings SET printed_rules_text = NULL WHERE printed_rules_text = ''`.execute(
    db,
  );

  // ── Clean up empty strings in printing_sources ─────────────────────────────
  await sql`UPDATE printing_sources SET printed_rules_text = NULL WHERE printed_rules_text = ''`.execute(
    db,
  );
  await sql`UPDATE printing_sources SET printed_effect_text = NULL WHERE printed_effect_text = ''`.execute(
    db,
  );

  // ── CHECK constraints: prevent empty strings ──────────────────────────────
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_no_empty_rules_text CHECK (rules_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_no_empty_effect_text CHECK (effect_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_rules_text CHECK (rules_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_effect_text CHECK (effect_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_no_empty_printed_rules_text CHECK (printed_rules_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_no_empty_printed_effect_text CHECK (printed_effect_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_printed_rules_text CHECK (printed_rules_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_printed_effect_text CHECK (printed_effect_text <> '')`.execute(
    db,
  );

  // ── CHECK constraint: domains must not be empty ───────────────────────────
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_domains_not_empty CHECK (array_length(domains, 1) > 0)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Drop CHECK constraints ────────────────────────────────────────────────
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_domains_not_empty`.execute(db);
  for (const constraint of [
    "chk_printing_sources_no_empty_printed_effect_text",
    "chk_printing_sources_no_empty_printed_rules_text",
    "chk_printings_no_empty_printed_effect_text",
    "chk_printings_no_empty_printed_rules_text",
    "chk_card_sources_no_empty_effect_text",
    "chk_card_sources_no_empty_rules_text",
    "chk_cards_no_empty_effect_text",
    "chk_cards_no_empty_rules_text",
  ]) {
    const table = constraint.replace("chk_", "").split("_no_empty_")[0];
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT IF EXISTS ${sql.raw(constraint)}`.execute(
      db,
    );
  }

  // ── printings.printed_rules_text: restore NOT NULL ────────────────────────
  await sql`UPDATE printings SET printed_rules_text = '' WHERE printed_rules_text IS NULL`.execute(
    db,
  );
  await db.schema
    .alterTable("printings")
    .alterColumn("printed_rules_text", (col) => col.setNotNull())
    .execute();

  // ── card_sources.effect_text: restore NOT NULL DEFAULT '' ─────────────────
  await sql`UPDATE card_sources SET effect_text = '' WHERE effect_text IS NULL`.execute(db);
  await sql`UPDATE card_sources SET rules_text = '' WHERE rules_text IS NULL`.execute(db);
  await db.schema
    .alterTable("card_sources")
    .alterColumn("effect_text", (col) => col.setNotNull())
    .execute();
  await sql`ALTER TABLE card_sources ALTER COLUMN effect_text SET DEFAULT ''`.execute(db);

  // ── cards: restore DEFAULT '' and backfill ────────────────────────────────
  await sql`UPDATE cards SET rules_text = '' WHERE rules_text IS NULL`.execute(db);
  await sql`UPDATE cards SET effect_text = '' WHERE effect_text IS NULL`.execute(db);
  await sql`ALTER TABLE cards ALTER COLUMN effect_text SET DEFAULT ''`.execute(db);
}
