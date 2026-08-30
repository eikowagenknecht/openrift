import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The source's event-configuration template on the catalogue row, and the
 * auto-accept toggle that reads it.
 *
 * Every listing row names the template its organizer ran the event from, and
 * the official programme runs on a handful of them: one template covers exactly
 * the Regional Qualifiers, another the weekly store league. That makes the
 * template the sharpest signal the listing carries about whether an event is
 * archive material — sharper than the name, which is whatever the store typed,
 * and sharper than the headlining flag, which stores set on their own events.
 *
 * The uuid is stored raw and never shown: which templates count as official is
 * a decision in code, so recognizing a new one is a deploy rather than a
 * backfill.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_catalog_events")
    .addColumn("event_configuration_template", "text")
    .execute();

  await db.schema
    .alterTable("meta_sync_settings")
    .addColumn("auto_accept_official", "boolean", (col) => col.defaultTo(false).notNull())
    .execute();

  // Partial, because the column is null for every row the source published
  // before it carried templates, and every read asks for one provider's
  // templated rows.
  await sql`
    CREATE INDEX idx_meta_catalog_events_template
      ON meta_catalog_events (provider, event_configuration_template)
      WHERE event_configuration_template IS NOT NULL
  `.execute(db);
}

/**
 * The template column is re-filled by the next crawl, since it is part of the
 * content hash: dropping it loses nothing that a sync will not restore.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_meta_catalog_events_template`.execute(db);
  await db.schema.alterTable("meta_sync_settings").dropColumn("auto_accept_official").execute();
  await db.schema
    .alterTable("meta_catalog_events")
    .dropColumn("event_configuration_template")
    .execute();
}
