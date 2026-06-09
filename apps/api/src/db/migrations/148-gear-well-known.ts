import type { Kysely } from "kysely";
import { sql } from "kysely";

// Promotes the "gear" card type to well-known so WellKnown.cardType.GEAR passes
// the startup validator. Seeded by 062-reference-tables (lowercased in 122) with
// is_well_known = FALSE in every environment.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE card_types SET is_well_known = TRUE WHERE slug = 'gear'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // protect_well_known blocks TRUE → FALSE transitions; disable the trigger
  // briefly so the rollback can unwind cleanly.
  await sql`ALTER TABLE card_types DISABLE TRIGGER trg_card_types_protect_well_known`.execute(db);
  await sql`UPDATE card_types SET is_well_known = FALSE WHERE slug = 'gear'`.execute(db);
  await sql`ALTER TABLE card_types ENABLE TRIGGER trg_card_types_protect_well_known`.execute(db);
}
