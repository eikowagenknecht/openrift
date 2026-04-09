import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("printing_events")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`gen_random_uuid()`)
        .notNull(),
    )
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("card_name", "text", (col) => col.notNull())
    .addColumn("set_name", "text")
    .addColumn("short_code", "text")
    .addColumn("rarity", "text")
    .addColumn("finish", "text")
    .addColumn("artist", "text")
    .addColumn("language", "text")
    .addColumn("changes", "jsonb")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("retry_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("printing_events")
    .addCheckConstraint("chk_printing_events_event_type", sql`event_type IN ('new', 'changed')`)
    .execute();

  await db.schema
    .alterTable("printing_events")
    .addCheckConstraint("chk_printing_events_status", sql`status IN ('pending', 'sent', 'failed')`)
    .execute();

  await db.schema
    .createIndex("idx_printing_events_status_created")
    .on("printing_events")
    .columns(["status", "created_at"])
    .execute();

  // Add updated_at trigger
  await sql`
    CREATE TRIGGER printing_events_set_updated_at
    BEFORE UPDATE ON printing_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("printing_events").execute();
}
