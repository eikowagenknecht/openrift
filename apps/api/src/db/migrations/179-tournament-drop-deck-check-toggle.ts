import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 — remove the `deck_check_enabled` toggle. It only ever gated whether the
// judge-verification UI showed; every submitted list already creates a deck-check
// entry, so "collect lists but never verify" was not a real mode. Deck check is
// just the view over collected lists, available whenever a tournament collects
// them (`deck_submission <> 'none'`). The `chk_tournaments_deck_check` coupling
// (deck check needs a list) goes with it — there is no toggle left to constrain.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tournaments").dropConstraint("chk_tournaments_deck_check").execute();
  await db.schema.alterTable("tournaments").dropColumn("deck_check_enabled").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reconstruct the flag as "collects lists" — the rule that replaced it — so
  // existing checking events round-trip back to deck_check_enabled = true.
  await db.schema
    .alterTable("tournaments")
    .addColumn("deck_check_enabled", "boolean", (col) => col.defaultTo(false).notNull())
    .execute();
  await sql`UPDATE tournaments SET deck_check_enabled = (deck_submission <> 'none')`.execute(db);
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint(
      "chk_tournaments_deck_check",
      sql`NOT deck_check_enabled OR deck_submission <> 'none'`,
    )
    .execute();
}
