import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Promote `custom_tags.category` from a freeform text column into a proper
  // lookup table so categories can be renamed in one place, validated against
  // a known set, and given their own label/description metadata. Existing
  // distinct category values are seeded as rows; the slug is the original
  // string and the label is start-cased ("region" → "Region").

  await db.schema
    .createTable("custom_tag_categories")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`uuidv7()`)
        .notNull(),
    )
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("custom_tag_categories_slug_check", sql`slug <> ''`)
    .addCheckConstraint("custom_tag_categories_label_check", sql`label <> ''`)
    .addCheckConstraint("custom_tag_categories_description_check", sql`description <> ''`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON custom_tag_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Seed categories from existing custom_tags.category values. The distinct
  // categories are picked first, then ROW_NUMBER assigns a stable
  // alphabetical sort_order; admins can reorder later via the admin UI.
  await sql`
    INSERT INTO custom_tag_categories (slug, label, sort_order)
    SELECT
      category,
      INITCAP(REPLACE(category, '-', ' ')),
      (ROW_NUMBER() OVER (ORDER BY category) - 1)::int
    FROM (SELECT DISTINCT category FROM custom_tags) distinct_cats
  `.execute(db);

  // Add the FK column, backfill from the seeded categories, then drop the
  // old text column. Done in this order so the FK is NOT NULL by the time
  // we commit and there's no window where category lookup is broken.
  await db.schema.alterTable("custom_tags").addColumn("category_id", "uuid").execute();

  await sql`
    UPDATE custom_tags ct
    SET category_id = c.id
    FROM custom_tag_categories c
    WHERE c.slug = ct.category
  `.execute(db);

  await db.schema.dropIndex("idx_custom_tags_category").execute();
  await db.schema.alterTable("custom_tags").dropColumn("category").execute();

  await db.schema
    .alterTable("custom_tags")
    .alterColumn("category_id", (col) => col.setNotNull())
    .execute();

  await db.schema
    .alterTable("custom_tags")
    .addForeignKeyConstraint(
      "custom_tags_category_id_fkey",
      ["category_id"],
      "custom_tag_categories",
      ["id"],
    )
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("idx_custom_tags_category_id")
    .on("custom_tags")
    .column("category_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("custom_tags").addColumn("category", "text").execute();

  await sql`
    UPDATE custom_tags ct
    SET category = c.slug
    FROM custom_tag_categories c
    WHERE c.id = ct.category_id
  `.execute(db);

  await db.schema.dropIndex("idx_custom_tags_category_id").execute();
  await db.schema
    .alterTable("custom_tags")
    .dropConstraint("custom_tags_category_id_fkey")
    .execute();
  await db.schema.alterTable("custom_tags").dropColumn("category_id").execute();
  await db.schema
    .alterTable("custom_tags")
    .alterColumn("category", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("custom_tags")
    .addCheckConstraint("custom_tags_category_check", sql`category <> ''`)
    .execute();
  await db.schema
    .createIndex("idx_custom_tags_category")
    .on("custom_tags")
    .column("category")
    .execute();

  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON custom_tag_categories`.execute(db);
  await db.schema.dropTable("custom_tag_categories").execute();
}
