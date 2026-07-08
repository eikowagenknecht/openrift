import type { Kysely } from "kysely";
import { sql } from "kysely";

// Preconstructed product catalog (ADR-015). Catalog data, not user data:
// a product is a fixed set of printings. Contents are
// only ever written by snapshotting a list server-side; there is no language,
// kind, draft, or sort_order modelling in v1 (see the ADR's Will Not Be Built).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("products")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_products_slug", sql`slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'`)
    .addCheckConstraint("chk_products_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint(
      "chk_products_description",
      sql`description IS NULL OR length(description) <= 2000`,
    )
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await db.schema
    .createTable("product_printings")
    .addColumn("product_id", "uuid", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull())
    .addCheckConstraint("chk_product_printings_quantity", sql`quantity > 0`)
    .addPrimaryKeyConstraint("product_printings_pkey", ["product_id", "printing_id"])
    .execute();

  await db.schema
    .alterTable("product_printings")
    .addForeignKeyConstraint("product_printings_product_fkey", ["product_id"], "products", ["id"])
    .onDelete("cascade")
    .execute();

  // Intentionally NOT ON DELETE CASCADE: a printing must not be deletable
  // while a product references it (matches how deck_cards references cards).
  await db.schema
    .alterTable("product_printings")
    .addForeignKeyConstraint("product_printings_printing_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .createIndex("idx_product_printings_printing")
    .on("product_printings")
    .column("printing_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("product_printings").execute();
  await db.schema.dropTable("products").execute();
}
