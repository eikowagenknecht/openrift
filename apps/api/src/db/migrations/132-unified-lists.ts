import type { Kysely } from "kysely";
import { sql } from "kysely";

// Collapses the separate trade_lists and wish_lists tables into a single
// `lists` table discriminated by `intent` ('buy' | 'sell' | 'organize').
// Entries reference exactly one of card_id, printing_id, or copy_id:
//   - card_id    – "any printing of this card"
//   - printing_id – "this exact printing, any copy"
//   - copy_id    – "this specific physical copy" (condition, signing,
//                  coffee stain, etc.) — only meaningful for sell/organize
//                  intent; the app rejects buy + copy_id, the DB doesn't
//                  police it (cost of a bogus row is zero).
//
// Neither old table was in production, so existing rows are discarded. The
// down() restores the original DDL so a rollback puts the schema back to the
// pre-132 shape (still without any data).
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Drop the old tables (items first for FK order) ────────────────────
  await db.schema.dropTable("trade_list_items").execute();
  await db.schema.dropTable("trade_lists").execute();
  await db.schema.dropTable("wish_list_items").execute();
  await db.schema.dropTable("wish_lists").execute();

  // ── 2. lists ─────────────────────────────────────────────────────────────
  // Unified list entity. `intent` discriminates the three surfaces:
  //   buy      – wishlist / cards the user wants
  //   sell     – trade list / cards the user offers
  //   organize – freeform grouping (themes, region buckets, …)
  // Sharing mirrors the decks/collections pattern: is_public + share_token,
  // where is_public lets the owner revoke without rotating the token.
  await db.schema
    .createTable("lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("intent", "text", (col) => col.notNull())
    .addColumn("is_public", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_lists_name_not_empty", sql`name <> ''`)
    .addCheckConstraint(
      "chk_lists_intent",
      sql`intent = ANY (ARRAY['buy'::text, 'sell'::text, 'organize'::text])`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addUniqueConstraint("lists_share_token_key", ["share_token"])
    .execute();

  // Composite unique enables the (list_id, user_id) FK from list_entries,
  // which prevents an entry from being moved across user boundaries.
  await db.schema
    .alterTable("lists")
    .addUniqueConstraint("uq_lists_id_user", ["id", "user_id"])
    .execute();

  await db.schema
    .alterTable("lists")
    .addForeignKeyConstraint("lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema.createIndex("idx_lists_user_id").on("lists").column("user_id").execute();

  // Composite index for "my buy lists" / "my sell lists" queries.
  await db.schema
    .createIndex("idx_lists_user_intent")
    .on("lists")
    .columns(["user_id", "intent"])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON lists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. list_entries ──────────────────────────────────────────────────────
  // Each entry targets exactly one of card_id, printing_id, or copy_id.
  // user_id is denormalized so the composite FKs to lists(id, user_id) and
  // copies(id, user_id) can enforce that entries can't cross user
  // boundaries (no listing someone else's copy on your sell list).
  await db.schema
    .createTable("list_entries")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("card_id", "uuid")
    .addColumn("printing_id", "uuid")
    .addColumn("copy_id", "uuid")
    .addColumn("quantity", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_list_entries_quantity", sql`quantity > 0`)
    .addCheckConstraint(
      "chk_list_entries_target_xor",
      sql`((card_id IS NOT NULL)::int + (printing_id IS NOT NULL)::int + (copy_id IS NOT NULL)::int) = 1`,
    )
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addForeignKeyConstraint("fk_list_entries_list_user", ["list_id", "user_id"], "lists", [
      "id",
      "user_id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addForeignKeyConstraint("list_entries_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addForeignKeyConstraint("list_entries_printing_id_fkey", ["printing_id"], "printings", ["id"])
    .execute();

  // copy_id FK is composite on (copy_id, user_id) so an entry can only point
  // at a copy belonging to the same user as the list. ON DELETE CASCADE so
  // removing a copy from your collection also removes the sell-list entry
  // pointing at it — you can't sell what you no longer track.
  await db.schema
    .alterTable("list_entries")
    .addForeignKeyConstraint("fk_list_entries_copy_user", ["copy_id", "user_id"], "copies", [
      "id",
      "user_id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_list_entries_list")
    .on("list_entries")
    .column("list_id")
    .execute();

  // Partial unique indexes, one per granularity. A card/printing/copy can
  // each appear at most once per list — but the same printing can appear
  // multiple times across the three indexes (e.g. one "any copy of printing
  // X" entry plus several copy_id entries for distinct physical copies of
  // the same printing, each with their own condition). The UX should steer
  // users to pick one granularity per card; the DB doesn't forbid the mix.
  await sql`
    CREATE UNIQUE INDEX uq_list_entries_card ON list_entries (list_id, card_id)
    WHERE card_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_list_entries_printing ON list_entries (list_id, printing_id)
    WHERE printing_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_list_entries_copy ON list_entries (list_id, copy_id)
    WHERE copy_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON list_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop the unified tables …
  await db.schema.dropTable("list_entries").execute();
  await db.schema.dropTable("lists").execute();

  // … and restore the original trade_lists / wish_lists DDL from
  // 001-core-schema. Data was discarded on the way in and is not restored.

  // -- trade_lists
  await db.schema
    .createTable("trade_lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addUniqueConstraint("trade_lists_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addUniqueConstraint("uq_trade_lists_id_user", ["id", "user_id"])
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addForeignKeyConstraint("trade_lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_trade_lists_user_id")
    .on("trade_lists")
    .column("user_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON trade_lists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // -- trade_list_items
  await db.schema
    .createTable("trade_list_items")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("trade_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("copy_id", "uuid", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .alterTable("trade_list_items")
    .addUniqueConstraint("uq_trade_list_items", ["trade_list_id", "copy_id"])
    .execute();

  await db.schema
    .alterTable("trade_list_items")
    .addForeignKeyConstraint(
      "fk_trade_list_items_list_user",
      ["trade_list_id", "user_id"],
      "trade_lists",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("trade_list_items")
    .addForeignKeyConstraint("fk_trade_list_items_copy_user", ["copy_id", "user_id"], "copies", [
      "id",
      "user_id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_trade_list_items_copy")
    .on("trade_list_items")
    .column("copy_id")
    .execute();

  await db.schema
    .createIndex("idx_trade_list_items_list")
    .on("trade_list_items")
    .column("trade_list_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON trade_list_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // -- wish_lists
  await db.schema
    .createTable("wish_lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addUniqueConstraint("wish_lists_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addUniqueConstraint("uq_wish_lists_id_user", ["id", "user_id"])
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addForeignKeyConstraint("wish_lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_wish_lists_user_id")
    .on("wish_lists")
    .column("user_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON wish_lists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // -- wish_list_items
  await db.schema
    .createTable("wish_list_items")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("wish_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("quantity_desired", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("printing_id", "uuid")
    .addColumn("card_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_wish_list_items_quantity", sql`quantity_desired > 0`)
    .addCheckConstraint(
      "chk_wish_list_items_target_xor",
      sql`(card_id IS NOT NULL) <> (printing_id IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint(
      "fk_wish_list_items_list_user",
      ["wish_list_id", "user_id"],
      "wish_lists",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint("wish_list_items_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint("wish_list_items_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .createIndex("idx_wish_list_items_list")
    .on("wish_list_items")
    .column("wish_list_id")
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_wish_list_items_card ON wish_list_items (wish_list_id, card_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_wish_list_items_printing ON wish_list_items (wish_list_id, printing_id)
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON wish_list_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}
