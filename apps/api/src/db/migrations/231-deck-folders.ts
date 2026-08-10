import type { Kysely } from "kysely";
import { sql } from "kysely";

// User-authored folders for organising the deck list. Deliberately many-to-many:
// a deck can sit in several folders at once, so the junction is its own table
// rather than a folder_id column on decks. Flat — no parent_id, matching every
// other user-facing container here (lists, collections).
//
// Unrelated to decks.collection_id (the "home collection" / physical deck box
// from migration 227). Folders organise the view; the home collection says where
// the cards actually live.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── deck_folders ─────────────────────────────────────────────────────────
  await db.schema
    .createTable("deck_folders")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_deck_folders_name_not_empty", sql`name <> ''`)
    .execute();

  await db.schema
    .alterTable("deck_folders")
    .addForeignKeyConstraint("deck_folders_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // Composite unique enables the (folder_id, user_id) FK from the junction,
  // which stops a deck being filed into another user's folder.
  await db.schema
    .alterTable("deck_folders")
    .addUniqueConstraint("uq_deck_folders_id_user", ["id", "user_id"])
    .execute();

  await db.schema
    .createIndex("idx_deck_folders_user_id")
    .on("deck_folders")
    .column("user_id")
    .execute();

  // Two folders with the same name are a typo, not a use case. Case-insensitive
  // so "Jank" and "jank" collide.
  await sql`
    CREATE UNIQUE INDEX uq_deck_folders_user_name ON deck_folders (user_id, lower(name))
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_folders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── deck_folder_entries ──────────────────────────────────────────────────
  // user_id is denormalized purely so both FKs can be composite, mirroring
  // list_entries: it makes cross-user membership unrepresentable rather than
  // merely unreachable through the API.
  await db.schema
    .createTable("deck_folder_entries")
    .addColumn("folder_id", "uuid", (col) => col.notNull())
    .addColumn("deck_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("deck_folder_entries_pkey", ["folder_id", "deck_id"])
    .execute();

  await db.schema
    .alterTable("deck_folder_entries")
    .addForeignKeyConstraint(
      "fk_deck_folder_entries_folder_user",
      ["folder_id", "user_id"],
      "deck_folders",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_folder_entries")
    .addForeignKeyConstraint("fk_deck_folder_entries_deck_user", ["deck_id", "user_id"], "decks", [
      "id",
      "user_id",
    ])
    .onDelete("cascade")
    .execute();

  // The PK covers folder_id lookups; this covers the "which folders is this
  // deck in" direction, which is what the deck list query needs.
  await db.schema
    .createIndex("idx_deck_folder_entries_deck")
    .on("deck_folder_entries")
    .column("deck_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("deck_folder_entries").execute();
  await db.schema.dropTable("deck_folders").execute();
}
