import type { Kysely } from "kysely";

// Products can belong to a set (the wave they released with), which the
// public /products page uses to group its tiles. Nullable: promo bundles or
// cross-set products simply have no set.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("products")
    .addColumn("set_id", "uuid", (col) => col.references("sets.id").onDelete("set null"))
    .execute();

  await db.schema.createIndex("idx_products_set").on("products").column("set_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("products").dropColumn("set_id").execute();
}
