import type { Kysely } from "kysely";

/**
 * Lets a user push rarely-used collections and lists behind a "Show more"
 * toggle in the collections sidebar, instead of scrolling past all of them.
 *
 * Lists get a plain column: a list has exactly one viewer (its owner), so a
 * column and a per-viewer preference mean the same thing there.
 *
 * Collections get a per-viewer table instead, mirroring
 * `collection_deckbuilding_prefs`. A group collection has many viewers, each
 * with their own opinion about their own sidebar, so a column on `collections`
 * would let one member hide a shared binder for the whole group. Absence of a
 * row means visible.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("lists")
    .addColumn("sidebar_hidden", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  await db.schema
    .createTable("collection_sidebar_prefs")
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("collection_id", "uuid", (col) => col.notNull())
    .addColumn("hidden", "boolean", (col) => col.notNull())
    .addPrimaryKeyConstraint("collection_sidebar_prefs_pkey", ["user_id", "collection_id"])
    .execute();

  await db.schema
    .alterTable("collection_sidebar_prefs")
    .addForeignKeyConstraint("fk_collection_sidebar_prefs_user", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("collection_sidebar_prefs")
    .addForeignKeyConstraint(
      "fk_collection_sidebar_prefs_collection",
      ["collection_id"],
      "collections",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_collection_sidebar_prefs_collection")
    .on("collection_sidebar_prefs")
    .column("collection_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("collection_sidebar_prefs").execute();
  await db.schema.alterTable("lists").dropColumn("sidebar_hidden").execute();
}
