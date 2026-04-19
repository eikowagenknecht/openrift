import type { Kysely } from "kysely";
import { sql } from "kysely";

// Promotes `metal` and `metal-deluxe` to well-known finishes so WellKnown.finish
// can reference them. `metal-deluxe` already exists in prod (user-managed row)
// but not in dev, so the insert uses ON CONFLICT DO UPDATE to preserve the
// prod row's label/sort_order while still flipping is_well_known.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO finishes (slug, label, sort_order, is_well_known) VALUES
      ('metal-deluxe', 'Metal Deluxe', 3, TRUE)
    ON CONFLICT (slug) DO UPDATE SET is_well_known = TRUE
  `.execute(db);

  await sql`
    UPDATE finishes SET is_well_known = TRUE WHERE slug = 'metal'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // protect_well_known blocks TRUE → FALSE transitions; disable the trigger
  // briefly so the rollback can unwind cleanly.
  await sql`ALTER TABLE finishes DISABLE TRIGGER trg_finishes_protect_well_known`.execute(db);

  await sql`
    UPDATE finishes SET is_well_known = FALSE WHERE slug IN ('metal', 'metal-deluxe')
  `.execute(db);

  await sql`DELETE FROM finishes WHERE slug = 'metal-deluxe'`.execute(db);

  await sql`ALTER TABLE finishes ENABLE TRIGGER trg_finishes_protect_well_known`.execute(db);
}
