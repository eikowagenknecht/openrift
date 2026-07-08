import type { Kysely } from "kysely";
import { sql } from "kysely";

// Admin audit log: one row per card-catalog admin mutation, recording who
// changed what (actor, action slug, entity, old/new jsonb payloads). Written
// best-effort after the mutation commits; never pruned.
//
// actor_user_id deliberately has NO foreign key: audit rows must survive user
// deletion. Reads LEFT JOIN users for display names. `action` has no CHECK
// constraint so new action slugs don't need a migration (a TS union enforces
// the vocabulary at the write site).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("admin_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("actor_user_id", "text", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("entity_type", "text", (col) => col.notNull())
    .addColumn("entity_id", "text")
    .addColumn("entity_label", "text")
    .addColumn("card_slug", "text")
    .addColumn("old_values", "jsonb")
    .addColumn("new_values", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await sql`
    CREATE INDEX idx_admin_events_created ON admin_events (created_at DESC, id DESC)
  `.execute(db);
  await sql`
    CREATE INDEX idx_admin_events_actor ON admin_events (actor_user_id, created_at DESC, id DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("admin_events").execute();
}
