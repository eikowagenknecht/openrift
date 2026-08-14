import type { Kysely } from "kysely";
import { sql } from "kysely";

// One stream overlay per user: the token an OBS browser source polls, plus
// whatever card is currently pushed to it.
//
// `payload` is a single jsonb blob rather than columns because the OBS source
// treats it as opaque — it renders what the dashboard put there, and the shape
// grows (plate on/off, corner, scale) without a migration each time. `version`
// is the ETag the poll conditions on: it bumps on every write, so an unchanged
// second costs a 304 with no body.
//
// Deliberately one row per user, not per scene. A creator running two scenes
// points both browser sources at the same token; splitting a channel per scene
// is a feature nobody has asked for and would double the dashboard's surface.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("overlay_channels")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().unique())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("payload", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("version", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_overlay_channels_token_not_empty", sql`token <> ''`)
    .execute();

  await db.schema
    .alterTable("overlay_channels")
    .addForeignKeyConstraint("overlay_channels_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON overlay_channels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("overlay_channels").execute();
}
