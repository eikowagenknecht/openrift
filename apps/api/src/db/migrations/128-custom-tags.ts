import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── custom_tags ──────────────────────────────────────────────────────
  // Admin-curated vocabulary of supplemental tags attachable to cards.
  // First use: "region" tags (Bandle City, Bilgewater, …) for a freeform
  // deck mode that ignores domain rules but restricts cards to one region.
  // `category` namespaces the tags so future custom-format keys (e.g.
  // "crew") don't bleed into the region filter UI.
  await db.schema
    .createTable("custom_tags")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`uuidv7()`)
        .notNull(),
    )
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("custom_tags_slug_check", sql`slug <> ''`)
    .addCheckConstraint("custom_tags_label_check", sql`label <> ''`)
    .addCheckConstraint("custom_tags_category_check", sql`category <> ''`)
    .addCheckConstraint("custom_tags_description_check", sql`description <> ''`)
    .execute();

  await db.schema
    .createIndex("idx_custom_tags_category")
    .on("custom_tags")
    .column("category")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON custom_tags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── card_custom_tags join ────────────────────────────────────────────
  await db.schema
    .createTable("card_custom_tags")
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("custom_tag_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("card_custom_tags_pkey", ["card_id", "custom_tag_id"])
    .execute();

  await db.schema
    .alterTable("card_custom_tags")
    .addForeignKeyConstraint("card_custom_tags_card_id_fkey", ["card_id"], "cards", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_custom_tags")
    .addForeignKeyConstraint(
      "card_custom_tags_custom_tag_id_fkey",
      ["custom_tag_id"],
      "custom_tags",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_card_custom_tags_custom_tag_id")
    .on("card_custom_tags")
    .column("custom_tag_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("card_custom_tags").execute();
  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON custom_tags`.execute(db);
  await db.schema.dropTable("custom_tags").execute();
}
