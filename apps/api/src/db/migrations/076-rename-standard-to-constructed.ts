import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // The protect_well_known trigger prevents renaming/deleting well-known rows,
  // so we temporarily disable it for this migration.
  await sql`ALTER TABLE deck_formats DISABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );

  await sql`INSERT INTO deck_formats (slug, label, sort_order, is_well_known)
            VALUES ('constructed', 'Constructed', 0, TRUE)`.execute(db);
  await sql`UPDATE decks SET format = 'constructed' WHERE format = 'standard'`.execute(db);
  await sql`DELETE FROM deck_formats WHERE slug = 'standard'`.execute(db);

  await sql`ALTER TABLE deck_formats ENABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE deck_formats DISABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );

  await sql`INSERT INTO deck_formats (slug, label, sort_order, is_well_known)
            VALUES ('standard', 'Standard', 0, TRUE)`.execute(db);
  await sql`UPDATE decks SET format = 'standard' WHERE format = 'constructed'`.execute(db);
  await sql`DELETE FROM deck_formats WHERE slug = 'constructed'`.execute(db);

  await sql`ALTER TABLE deck_formats ENABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );
}
