import type { Kysely } from "kysely";
import { sql } from "kysely";

// Named bundles of on-screen dressing for the creator tools: the stream overlay
// (migration 238) and presentation mode. A creator sets a scene up once — plate
// on the left, QR to their deck page, cards at 70% against a green ground — and
// recalls it by name at the start of the next stream instead of rebuilding it
// switch by switch.
//
// `config` is one jsonb blob for the same reason the overlay payload is: the set
// of switches grows with the creator tools and a preset stores only the ones it
// actually sets, so a column per switch would mean a migration per switch and a
// row full of nulls meaning "unset" that look exactly like "set to the default".
// Applying a preset merges its set fields over whatever the surface already has.
//
// Unique on (user_id, name) because a preset is recalled by name — two called
// "Draft night" would be a coin flip. Not case-insensitive: the name is a label
// the creator picked, and "Draft Night" beside "draft night" is their business.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("stage_presets")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("config", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_stage_presets_name_not_empty", sql`name <> ''`)
    // The reader narrows the blob through the config schema rather than trusting
    // it, but an array or a bare string is not a preset under any reading, so the
    // database refuses those outright.
    .addCheckConstraint("chk_stage_presets_config_object", sql`jsonb_typeof(config) = 'object'`)
    .execute();

  await db.schema
    .alterTable("stage_presets")
    .addForeignKeyConstraint("stage_presets_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // Doubles as the index behind the by-user list, which is the only read that
  // is not already keyed by id.
  await db.schema
    .createIndex("uq_stage_presets_user_name")
    .unique()
    .on("stage_presets")
    .columns(["user_id", "name"])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON stage_presets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("stage_presets").execute();
}
