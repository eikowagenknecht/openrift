import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Per-deck format config (jsonb so future custom formats can shape it
  // however they need without another schema migration). NULL means
  // "unconfigured" — e.g. a freshly-created Custom-Region deck that hasn't
  // picked a region yet. The shape is owned by each format's code; for
  // custom-region it's `{"tagSlugs": ["<slug from custom_tags>", ...]}` —
  // one or more region tag slugs, OR-matched at validation time.
  await db.schema.alterTable("decks").addColumn("format_config", "jsonb").execute();

  // Register the new well-known format. Sort order after freeform.
  await sql`ALTER TABLE deck_formats DISABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );
  await sql`
    INSERT INTO deck_formats (slug, label, sort_order, is_well_known)
    VALUES ('custom-region', 'Custom - Region', 2, TRUE)
  `.execute(db);
  await sql`ALTER TABLE deck_formats ENABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE deck_formats DISABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );
  await sql`DELETE FROM deck_formats WHERE slug = 'custom-region'`.execute(db);
  await sql`ALTER TABLE deck_formats ENABLE TRIGGER trg_deck_formats_protect_well_known`.execute(
    db,
  );

  await db.schema.alterTable("decks").dropColumn("format_config").execute();
}
