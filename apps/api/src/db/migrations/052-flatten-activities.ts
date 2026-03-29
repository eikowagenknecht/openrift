import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Create collection_events table ──────────────────────────────────────────
  await db.schema
    .createTable("collection_events")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull().references("printings.id"))
    .addColumn("copy_id", "uuid")
    .addColumn("from_collection_id", "uuid")
    .addColumn("from_collection_name", "text")
    .addColumn("to_collection_id", "uuid")
    .addColumn("to_collection_name", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── CHECK constraints ───────────────────────────────────────────────────────
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT chk_collection_events_action
        CHECK (action IN ('added', 'removed', 'moved')),
      ADD CONSTRAINT chk_collection_events_collection_presence
        CHECK (
          (action = 'added'   AND to_collection_id   IS NOT NULL) OR
          (action = 'removed' AND from_collection_id IS NOT NULL) OR
          (action = 'moved'   AND from_collection_id IS NOT NULL AND to_collection_id IS NOT NULL)
        )
  `.execute(db);

  // ── Composite FKs (SET NULL on related column only) ─────────────────────────
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_copy_user
        FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
        ON DELETE SET NULL (copy_id),
      ADD CONSTRAINT fk_collection_events_from_collection_user
        FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
        ON DELETE SET NULL (from_collection_id),
      ADD CONSTRAINT fk_collection_events_to_collection_user
        FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
        ON DELETE SET NULL (to_collection_id)
  `.execute(db);

  // ── Indexes ─────────────────────────────────────────────────────────────────
  await db.schema
    .createIndex("idx_collection_events_user_created")
    .on("collection_events")
    .columns(["user_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_collection_events_copy")
    .on("collection_events")
    .column("copy_id")
    .execute();

  // ── Migrate data from activity_items ────────────────────────────────────────
  await sql`
    INSERT INTO collection_events (id, user_id, action, printing_id, copy_id,
      from_collection_id, from_collection_name, to_collection_id, to_collection_name, created_at)
    SELECT id, user_id, action, printing_id, copy_id,
      from_collection_id, from_collection_name, to_collection_id, to_collection_name, created_at
    FROM activity_items
  `.execute(db);

  // ── Drop old tables ─────────────────────────────────────────────────────────
  await db.schema.dropTable("activity_items").execute();
  await db.schema.dropTable("activities").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate activities table
  await db.schema
    .createTable("activities")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("date", "date", (col) => col.notNull().defaultTo(sql`CURRENT_DATE`))
    .addColumn("description", "text")
    .addColumn("is_auto", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Recreate activity_items table (no data migration back — lossy)
  await db.schema
    .createTable("activity_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("activity_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("activity_type", "text", (col) => col.notNull())
    .addColumn("copy_id", "uuid")
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("from_collection_id", "uuid")
    .addColumn("from_collection_name", "text")
    .addColumn("to_collection_id", "uuid")
    .addColumn("to_collection_name", "text")
    .addColumn("metadata_snapshot", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("printing_id", "uuid", (col) => col.notNull().references("printings.id"))
    .execute();

  // Recreate constraints and indexes that other migrations expect
  await sql`
    ALTER TABLE activities
      ADD CONSTRAINT chk_activities_type
        CHECK (type IN ('acquisition', 'disposal', 'trade', 'reorganization')),
      ADD CONSTRAINT uq_activities_id_user_type UNIQUE (id, user_id, type);

    ALTER TABLE activity_items
      ADD CONSTRAINT chk_activity_items_action
        CHECK (action IN ('added', 'removed', 'moved')),
      ADD CONSTRAINT chk_activity_items_collection_presence
        CHECK (
          (action = 'added'   AND to_collection_id   IS NOT NULL) OR
          (action = 'removed' AND from_collection_id IS NOT NULL) OR
          (action = 'moved'   AND from_collection_id IS NOT NULL AND to_collection_id IS NOT NULL)
        ),
      ADD CONSTRAINT chk_activity_items_type_action
        CHECK (
          (activity_type = 'acquisition'    AND action = 'added') OR
          (activity_type = 'disposal'       AND action = 'removed') OR
          (activity_type = 'trade'          AND action IN ('added', 'removed')) OR
          (activity_type = 'reorganization' AND action = 'moved')
        );

    ALTER TABLE activity_items
      ADD CONSTRAINT fk_activity_items_activity_user
        FOREIGN KEY (activity_id, user_id, activity_type) REFERENCES activities(id, user_id, type) ON DELETE CASCADE,
      ADD CONSTRAINT fk_activity_items_copy_user
        FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id) ON DELETE SET NULL (copy_id),
      ADD CONSTRAINT fk_activity_items_from_collection_user
        FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id) ON DELETE SET NULL (from_collection_id),
      ADD CONSTRAINT fk_activity_items_to_collection_user
        FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id) ON DELETE SET NULL (to_collection_id);

    CREATE INDEX idx_activities_user_id ON activities (user_id);
    CREATE INDEX idx_activity_items_activity ON activity_items (activity_id);
    CREATE INDEX idx_activity_items_copy ON activity_items (copy_id);

    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON activities
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await db.schema.dropTable("collection_events").execute();
}
