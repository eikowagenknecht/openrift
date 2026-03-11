import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Create printing_images table ──────────────────────────────────────────
  await db.schema
    .createTable("printing_images")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("printing_id", "text", (col) => col.notNull().references("printings.id"))
    .addColumn("face", "text", (col) => col.notNull().defaultTo("front"))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("original_url", "text")
    .addColumn("rehosted_url", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex("idx_printing_images_printing_id")
    .on("printing_images")
    .column("printing_id")
    .execute();

  // One image per printing + face + source
  await db.schema
    .createIndex("idx_printing_images_source")
    .on("printing_images")
    .columns(["printing_id", "face", "source"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_printing_images_active")
    .on("printing_images")
    .columns(["printing_id", "face"])
    .unique()
    .where(sql.ref("is_active"), "=", true)
    .execute();

  // ── Migrate existing image_url data ───────────────────────────────────────
  // DML (INSERT...SELECT) is not expressible in the schema builder
  await sql`
    INSERT INTO printing_images (printing_id, face, source, original_url, rehosted_url, is_active)
    SELECT id, 'front', 'gallery', NULL, image_url, true
    FROM printings
    WHERE image_url IS NOT NULL AND image_url LIKE '/card-images/%'
  `.execute(db);

  // DML (INSERT...SELECT) is not expressible in the schema builder
  await sql`
    INSERT INTO printing_images (printing_id, face, source, original_url, rehosted_url, is_active)
    SELECT id, 'front', 'gallery', image_url, NULL, true
    FROM printings
    WHERE image_url IS NOT NULL AND image_url NOT LIKE '/card-images/%'
  `.execute(db);

  // ── Drop the column ───────────────────────────────────────────────────────
  await db.schema.alterTable("printings").dropColumn("image_url").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore image_url column
  await db.schema.alterTable("printings").addColumn("image_url", "text").execute();

  // DML (UPDATE...FROM) is not expressible in the schema builder
  await sql`
    UPDATE printings SET image_url = COALESCE(pi.rehosted_url, pi.original_url)
    FROM printing_images pi
    WHERE pi.printing_id = printings.id AND pi.face = 'front' AND pi.is_active = true
  `.execute(db);

  await db.schema.dropTable("printing_images").execute();
}
