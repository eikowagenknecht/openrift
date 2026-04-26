import type { Kysely } from "kysely";
import { sql } from "kysely";

// Promotes the `Token` super_type to well-known so WellKnown.superType.TOKEN
// passes the startup validator. The row already exists in every environment
// (seeded by 062-reference-tables) but with is_well_known = FALSE.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE super_types SET is_well_known = TRUE WHERE slug = 'Token'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // protect_well_known blocks TRUE → FALSE transitions; disable the trigger
  // briefly so the rollback can unwind cleanly.
  await sql`ALTER TABLE super_types DISABLE TRIGGER trg_super_types_protect_well_known`.execute(db);

  await sql`
    UPDATE super_types SET is_well_known = FALSE WHERE slug = 'Token'
  `.execute(db);

  await sql`ALTER TABLE super_types ENABLE TRIGGER trg_super_types_protect_well_known`.execute(db);
}
