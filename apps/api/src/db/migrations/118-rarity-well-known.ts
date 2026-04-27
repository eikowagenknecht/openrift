import type { Kysely } from "kysely";
import { sql } from "kysely";

// Promotes the five canonical rarity rows to well-known so WellKnown.rarity
// passes the startup validator. Rows are seeded by 062-reference-tables in
// every environment with is_well_known = FALSE.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE rarities SET is_well_known = TRUE
     WHERE slug IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // protect_well_known blocks TRUE → FALSE transitions; disable the trigger
  // briefly so the rollback can unwind cleanly.
  await sql`ALTER TABLE rarities DISABLE TRIGGER trg_rarities_protect_well_known`.execute(db);

  await sql`
    UPDATE rarities SET is_well_known = FALSE
     WHERE slug IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')
  `.execute(db);

  await sql`ALTER TABLE rarities ENABLE TRIGGER trg_rarities_protect_well_known`.execute(db);
}
