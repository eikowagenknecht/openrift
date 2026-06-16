import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deck plans (ADR-029) gain an alternative battlefield layout: instead of one
// battlefield per scenario (Game 1 / going first / going second), the user can
// switch to a free-text "custom plan". `battlefield_custom` is the toggle and
// `battlefield_note` holds the text; the per-scenario card columns are kept so
// toggling back restores them.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_plans")
    .addColumn("battlefield_custom", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("battlefield_note", "text", (col) => col.defaultTo("").notNull())
    .execute();

  await db.schema
    .alterTable("deck_plans")
    .addCheckConstraint("chk_deck_plans_battlefield_note", sql`length(battlefield_note) <= 4000`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_plans")
    .dropConstraint("chk_deck_plans_battlefield_note")
    .execute();
  await db.schema.alterTable("deck_plans").dropColumn("battlefield_note").execute();
  await db.schema.alterTable("deck_plans").dropColumn("battlefield_custom").execute();
}
