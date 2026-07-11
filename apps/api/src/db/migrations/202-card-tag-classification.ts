import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── tag_categories ───────────────────────────────────────────────────
  // Admin-managed categories for the printed card tags (cards.tags):
  // regions, champion names, species, … The printed tag vocabulary mixes
  // these taxonomies, so classifying each tag lets the filter UI group
  // tag options into meaningful sections.
  await db.schema
    .createTable("tag_categories")
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
    .addCheckConstraint("tag_categories_slug_check", sql`slug <> ''`)
    .addCheckConstraint("tag_categories_label_check", sql`label <> ''`)
    .addCheckConstraint("tag_categories_description_check", sql`description <> ''`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON tag_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── tag_definitions ──────────────────────────────────────────────────
  // One row per classified printed tag. `tag` is the exact string as it
  // appears in cards.tags (display casing, curly apostrophes, spaces).
  // A tag without a row is simply unclassified — no sync with card
  // imports is needed. The btrim check keeps values free of leading and
  // trailing whitespace (the filter combobox uses a leading space as an
  // id-namespace separator).
  await db.schema
    .createTable("tag_definitions")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`uuidv7()`)
        .notNull(),
    )
    .addColumn("tag", "text", (col) => col.notNull().unique())
    .addColumn("category_id", "uuid", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("tag_definitions_tag_check", sql`tag <> '' AND tag = btrim(tag)`)
    .execute();

  await db.schema
    .alterTable("tag_definitions")
    .addForeignKeyConstraint(
      "tag_definitions_category_id_fkey",
      ["category_id"],
      "tag_categories",
      ["id"],
    )
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("idx_tag_definitions_category_id")
    .on("tag_definitions")
    .column("category_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON tag_definitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── seed ─────────────────────────────────────────────────────────────
  // Only the categories are seeded. Tag → category assignments are made
  // through the admin UI (with a "detect legend tags from Legend cards"
  // helper), never automatically by a migration.
  await sql`
    INSERT INTO tag_categories (slug, label, sort_order)
    VALUES ('region', 'Region', 0), ('legend', 'Legend', 1), ('species', 'Species', 2)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON tag_definitions`.execute(db);
  await db.schema.dropTable("tag_definitions").execute();
  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON tag_categories`.execute(db);
  await db.schema.dropTable("tag_categories").execute();
}
