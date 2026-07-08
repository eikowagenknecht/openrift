import { sql } from "kysely";
import type { Kysely } from "kysely";

// Printing-change Discord notifications were removed; the queue now only carries
// "new printing" announcements, which are enriched from live printing state at
// flush time. Drop the change-tracking columns and the event_type discriminator.
export async function up(db: Kysely<unknown>): Promise<void> {
  // Existing "changed" events are notifications only — safe to discard. They must
  // go before the event_type column can be dropped.
  await sql`DELETE FROM printing_events WHERE event_type = 'changed'`.execute(db);

  await sql`ALTER TABLE printing_events DROP CONSTRAINT chk_printing_events_event_type`.execute(db);
  await db.schema.alterTable("printing_events").dropColumn("event_type").execute();
  await db.schema.alterTable("printing_events").dropColumn("changes").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("printing_events")
    .addColumn("event_type", "text", (col) => col.notNull().defaultTo("new"))
    .execute();
  await db.schema.alterTable("printing_events").addColumn("changes", "jsonb").execute();
  await sql`
    ALTER TABLE printing_events
    ADD CONSTRAINT chk_printing_events_event_type
    CHECK (event_type IN ('new', 'changed'))
  `.execute(db);
}
