import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds the `ultimate` art variant to the reference table so
// WellKnown.artVariant.ULTIMATE resolves at API startup. Used for the rarest
// tier introduced with UNL (the Baron Nashor Ultimate, <0.1% of packs). The
// pack opener simulator picks from this pool when a set has any ultimates.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO art_variants (slug, label, sort_order, is_well_known) VALUES
      ('ultimate', 'Ultimate', 3, TRUE)
    ON CONFLICT (slug) DO UPDATE SET
      label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      is_well_known = TRUE
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // protect_well_known blocks TRUE → FALSE transitions; disable the trigger
  // briefly so the rollback can unwind cleanly.
  await sql`ALTER TABLE art_variants DISABLE TRIGGER trg_art_variants_protect_well_known`.execute(
    db,
  );

  await sql`DELETE FROM art_variants WHERE slug = 'ultimate'`.execute(db);

  await sql`ALTER TABLE art_variants ENABLE TRIGGER trg_art_variants_protect_well_known`.execute(
    db,
  );
}
