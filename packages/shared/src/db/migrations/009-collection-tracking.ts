import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Collections ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("collections")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("available_for_deckbuilding", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("is_inbox", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("share_token", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_collections_user_id")
    .on("collections")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("uq_collections_user_inbox")
    .on("collections")
    .column("user_id")
    .unique()
    .where(sql.ref("is_inbox"), "=", true)
    .execute();

  await db.schema
    .alterTable("collections")
    .addUniqueConstraint("uq_collections_id_user", ["id", "user_id"])
    .execute();

  // ── Collection deletion guard ─────────────────────────────────────────────
  // PL/pgSQL functions and triggers are not expressible in the schema builder
  await sql`
    CREATE FUNCTION prevent_nonempty_collection_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Allow if the owning user no longer exists (user deletion cascade).
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
        RETURN OLD;
      END IF;
      -- Block if the collection still has copies
      IF EXISTS (SELECT 1 FROM copies WHERE collection_id = OLD.id LIMIT 1) THEN
        RAISE EXCEPTION
          'Cannot delete collection % — it still has copies. Move them first.',
          OLD.id;
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_prevent_nonempty_collection_delete
      BEFORE DELETE ON collections
      FOR EACH ROW
      EXECUTE FUNCTION prevent_nonempty_collection_delete()
  `.execute(db);

  // ── Sources ───────────────────────────────────────────────────────────────
  await db.schema
    .createTable("sources")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_sources_user_id").on("sources").column("user_id").execute();

  await db.schema
    .alterTable("sources")
    .addUniqueConstraint("uq_sources_id_user", ["id", "user_id"])
    .execute();

  // ── Copies ────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("copies")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("printing_id", "text", (col) => col.notNull().references("printings.id"))
    .addColumn("collection_id", "uuid", (col) => col.notNull())
    .addColumn("source_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint(
      "fk_copies_collection_user",
      ["collection_id", "user_id"],
      "collections",
      ["id", "user_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .execute();

  // ON DELETE SET NULL (source_id) targets a specific column — not expressible in the builder
  await sql`
    ALTER TABLE copies ADD CONSTRAINT fk_copies_source_user
      FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id)
      ON DELETE SET NULL (source_id)
  `.execute(db);

  await db.schema
    .createIndex("idx_copies_user_printing")
    .on("copies")
    .columns(["user_id", "printing_id"])
    .execute();
  await db.schema
    .createIndex("idx_copies_collection")
    .on("copies")
    .column("collection_id")
    .execute();
  await db.schema.createIndex("idx_copies_source").on("copies").column("source_id").execute();

  await db.schema
    .alterTable("copies")
    .addUniqueConstraint("uq_copies_id_user", ["id", "user_id"])
    .execute();

  // ── Activities ────────────────────────────────────────────────────────────
  await db.schema
    .createTable("activities")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("date", "date", (col) => col.notNull().defaultTo(sql`CURRENT_DATE`))
    .addColumn("description", "text")
    .addColumn("is_auto", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "chk_activities_type",
      sql`type IN ('acquisition', 'disposal', 'trade', 'reorganization')`,
    )
    .execute();

  await db.schema
    .createIndex("idx_activities_user_id")
    .on("activities")
    .column("user_id")
    .execute();

  await db.schema
    .alterTable("activities")
    .addUniqueConstraint("uq_activities_id_user_type", ["id", "user_id", "type"])
    .execute();

  // ── Activity Items ────────────────────────────────────────────────────────
  await db.schema
    .createTable("activity_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("activity_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("activity_type", "text", (col) => col.notNull())
    .addColumn("copy_id", "uuid")
    .addColumn("printing_id", "text", (col) => col.notNull().references("printings.id"))
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("from_collection_id", "uuid")
    .addColumn("from_collection_name", "text")
    .addColumn("to_collection_id", "uuid")
    .addColumn("to_collection_name", "text")
    .addColumn("metadata_snapshot", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint(
      "fk_activity_items_activity_user",
      ["activity_id", "user_id", "activity_type"],
      "activities",
      ["id", "user_id", "type"],
      (fk) => fk.onDelete("cascade"),
    )
    .addCheckConstraint("chk_activity_items_action", sql`action IN ('added', 'removed', 'moved')`)
    .addCheckConstraint(
      "chk_activity_items_type_action",
      sql`
        (activity_type = 'acquisition'    AND action = 'added')   OR
        (activity_type = 'disposal'       AND action = 'removed') OR
        (activity_type = 'trade'          AND action IN ('added', 'removed')) OR
        (activity_type = 'reorganization' AND action = 'moved')
      `,
    )
    .execute();

  // ON DELETE SET NULL (col) targets a specific column — not expressible in the builder
  await sql`
    ALTER TABLE activity_items ADD CONSTRAINT fk_activity_items_copy_user
      FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
      ON DELETE SET NULL (copy_id)
  `.execute(db);
  await sql`
    ALTER TABLE activity_items ADD CONSTRAINT fk_activity_items_from_collection_user
      FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (from_collection_id)
  `.execute(db);
  await sql`
    ALTER TABLE activity_items ADD CONSTRAINT fk_activity_items_to_collection_user
      FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (to_collection_id)
  `.execute(db);

  await db.schema
    .createIndex("idx_activity_items_activity")
    .on("activity_items")
    .column("activity_id")
    .execute();
  await db.schema
    .createIndex("idx_activity_items_copy")
    .on("activity_items")
    .column("copy_id")
    .execute();

  // ── Decks ─────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("decks")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("format", "text", (col) => col.notNull())
    .addColumn("is_wanted", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_public", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("share_token", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("chk_decks_format", sql`format IN ('standard', 'freeform')`)
    .execute();

  await db.schema.createIndex("idx_decks_user_id").on("decks").column("user_id").execute();

  // ── Deck Cards ────────────────────────────────────────────────────────────
  await db.schema
    .createTable("deck_cards")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull().references("decks.id").onDelete("cascade"))
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id"))
    .addColumn("zone", "text", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1))
    .addCheckConstraint("chk_deck_cards_quantity", sql`quantity > 0`)
    .addCheckConstraint("chk_deck_cards_zone", sql`zone IN ('main', 'sideboard')`)
    .addUniqueConstraint("uq_deck_cards", ["deck_id", "card_id", "zone"])
    .execute();

  await db.schema.createIndex("idx_deck_cards_deck").on("deck_cards").column("deck_id").execute();

  // ── Wish Lists ────────────────────────────────────────────────────────────
  await db.schema
    .createTable("wish_lists")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_wish_lists_user_id")
    .on("wish_lists")
    .column("user_id")
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addUniqueConstraint("uq_wish_lists_id_user", ["id", "user_id"])
    .execute();

  // ── Wish List Items ───────────────────────────────────────────────────────
  await db.schema
    .createTable("wish_list_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("wish_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.references("cards.id"))
    .addColumn("printing_id", "text", (col) => col.references("printings.id"))
    .addColumn("quantity_desired", "integer", (col) => col.notNull().defaultTo(1))
    .addForeignKeyConstraint(
      "fk_wish_list_items_list_user",
      ["wish_list_id", "user_id"],
      "wish_lists",
      ["id", "user_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addCheckConstraint("chk_wish_list_items_quantity", sql`quantity_desired > 0`)
    .addCheckConstraint(
      "chk_wish_list_items_target",
      sql`
        (card_id IS NOT NULL AND printing_id IS NULL) OR
        (card_id IS NULL AND printing_id IS NOT NULL)
      `,
    )
    .addUniqueConstraint("uq_wish_list_items_card", ["wish_list_id", "card_id"])
    .addUniqueConstraint("uq_wish_list_items_printing", ["wish_list_id", "printing_id"])
    .execute();

  await db.schema
    .createIndex("idx_wish_list_items_list")
    .on("wish_list_items")
    .column("wish_list_id")
    .execute();

  // ── Trade Lists ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("trade_lists")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_trade_lists_user_id")
    .on("trade_lists")
    .column("user_id")
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addUniqueConstraint("uq_trade_lists_id_user", ["id", "user_id"])
    .execute();

  // ── Trade List Items ──────────────────────────────────────────────────────
  await db.schema
    .createTable("trade_list_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("trade_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("copy_id", "uuid", (col) => col.notNull())
    .addForeignKeyConstraint(
      "fk_trade_list_items_list_user",
      ["trade_list_id", "user_id"],
      "trade_lists",
      ["id", "user_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "fk_trade_list_items_copy_user",
      ["copy_id", "user_id"],
      "copies",
      ["id", "user_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addUniqueConstraint("uq_trade_list_items", ["trade_list_id", "copy_id"])
    .execute();

  await db.schema
    .createIndex("idx_trade_list_items_list")
    .on("trade_list_items")
    .column("trade_list_id")
    .execute();
  await db.schema
    .createIndex("idx_trade_list_items_copy")
    .on("trade_list_items")
    .column("copy_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("trade_list_items").ifExists().execute();
  await db.schema.dropTable("trade_lists").ifExists().execute();
  await db.schema.dropTable("wish_list_items").ifExists().execute();
  await db.schema.dropTable("wish_lists").ifExists().execute();
  await db.schema.dropTable("deck_cards").ifExists().execute();
  await db.schema.dropTable("decks").ifExists().execute();
  await db.schema.dropTable("activity_items").ifExists().execute();
  await db.schema.dropTable("activities").ifExists().execute();
  await db.schema.dropTable("copies").ifExists().execute();
  await db.schema.dropTable("sources").ifExists().execute();
  // DROP TRIGGER / DROP FUNCTION are not expressible in the schema builder
  await sql`DROP TRIGGER IF EXISTS trg_prevent_nonempty_collection_delete ON collections`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS prevent_nonempty_collection_delete`.execute(db);
  await db.schema.dropTable("collections").ifExists().execute();
}
