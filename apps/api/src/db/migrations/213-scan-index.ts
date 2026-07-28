import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Metadata for the on-device scanner's embedding bank (one singleton row).
 *
 * The bank itself is a content-hashed binary written under `media/scan/` by
 * the rebuild job; this row records which generation is current so the public
 * manifest endpoint can hand out the right URLs and the client can cache the
 * assets immutably.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("scan_index")
    .addColumn("id", "integer", (col) => col.primaryKey())
    .addColumn("format_version", "integer", (col) => col.notNull())
    .addColumn("bank_hash", "text", (col) => col.notNull())
    .addColumn("entry_count", "integer", (col) => col.notNull())
    .addColumn("encoder_tag", "text", (col) => col.notNull())
    .addColumn("watermark", "timestamptz")
    .addColumn("built_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("duration_ms", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_scan_index_singleton", sql`id = 1`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON scan_index
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("scan_index").execute();
}
