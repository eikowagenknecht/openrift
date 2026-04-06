import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Remove the FK and column from copies first
  await db.schema
    .alterTable("copies")
    .dropConstraint("fk_copies_acquisition_source_user")
    .execute();
  await db.schema.dropIndex("idx_copies_acquisition_source").execute();
  await db.schema.alterTable("copies").dropColumn("acquisition_source_id").execute();

  // Drop the acquisition_sources table
  await sql`DROP TABLE IF EXISTS acquisition_sources CASCADE`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate acquisition_sources table
  await db.schema
    .createTable("acquisition_sources")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("acquisition_sources")
    .addUniqueConstraint("uq_sources_id_user", ["id", "user_id"])
    .execute();

  await db.schema
    .createIndex("idx_acquisition_sources_user_id")
    .on("acquisition_sources")
    .column("user_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON acquisition_sources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Add the column back to copies
  await db.schema.alterTable("copies").addColumn("acquisition_source_id", "uuid").execute();

  await db.schema
    .createIndex("idx_copies_acquisition_source")
    .on("copies")
    .column("acquisition_source_id")
    .execute();

  await sql`
    ALTER TABLE copies
    ADD CONSTRAINT fk_copies_acquisition_source_user
    FOREIGN KEY (acquisition_source_id, user_id) REFERENCES acquisition_sources(id, user_id)
    ON DELETE SET NULL (acquisition_source_id)
  `.execute(db);
}
