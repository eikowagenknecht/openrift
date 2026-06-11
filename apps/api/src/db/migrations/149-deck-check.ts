import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deck check for tournament judges (ADR-025). Four tables under the
// `deck_check_` prefix (never `tournament`, to avoid colliding with ADR-014's
// tournaments and ADR-022's pod_tournaments), plus a fourth value 'judge' in
// the friend-group role hierarchy (owner > admin > judge > member).
//
// Events are created in OpenRift and addressed by their uuid; pushes can only
// fill existing events. Entries are read-only snapshots of provider data
// pushed over a key-authed
// ingest endpoint. They deliberately do NOT reuse decks/deck_cards because
// card lines must be representable when resolution fails (deck_cards.card_id
// is NOT NULL) and entrant lists must never leak into deck surfaces.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. friend_group_members.role gains 'judge' ────────────────────────────
  await sql`
    ALTER TABLE friend_group_members
      DROP CONSTRAINT chk_friend_group_members_role
  `.execute(db);
  await sql`
    ALTER TABLE friend_group_members
      ADD CONSTRAINT chk_friend_group_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'judge'::text, 'member'::text]))
  `.execute(db);

  // ── 2. deck_check_events ───────────────────────────────────────────────────
  await db.schema
    .createTable("deck_check_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("event_date", "date")
    .addColumn("format", "text")
    .addColumn("allowed_sets", "jsonb")
    .addColumn("status", "text", (col) => col.defaultTo("active").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_deck_check_events_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint("chk_deck_check_events_status", sql`status IN ('active', 'archived')`)
    .execute();

  await db.schema
    .alterTable("deck_check_events")
    .addForeignKeyConstraint("deck_check_events_group_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_check_events")
    .addForeignKeyConstraint("deck_check_events_format_fkey", ["format"], "deck_formats", ["slug"])
    .execute();

  await db.schema
    .createIndex("idx_deck_check_events_group")
    .on("deck_check_events")
    .column("group_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_check_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. deck_check_entries ──────────────────────────────────────────────────
  await db.schema
    .createTable("deck_check_entries")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("event_id", "uuid", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    .addColumn("player_email", "text")
    .addColumn("player_handle", "text")
    .addColumn("submitted_at", "timestamptz")
    .addColumn("publish_opt_out", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("content_hash", "text", (col) => col.notNull())
    .addColumn("check_status", "text", (col) => col.defaultTo("unchecked").notNull())
    .addColumn("checked_by", "text")
    .addColumn("checked_at", "timestamptz")
    .addColumn("notes", "text")
    .addColumn("change_summary", "jsonb")
    .addColumn("withdrawn_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint(
      "chk_deck_check_entries_player_name",
      sql`length(player_name) BETWEEN 1 AND 120`,
    )
    .addCheckConstraint(
      "chk_deck_check_entries_player_email",
      sql`player_email IS NULL OR length(player_email) <= 254`,
    )
    .addCheckConstraint(
      "chk_deck_check_entries_player_handle",
      sql`player_handle IS NULL OR length(player_handle) <= 120`,
    )
    .addCheckConstraint(
      "chk_deck_check_entries_status",
      sql`check_status IN ('unchecked', 'checked', 'issue')`,
    )
    .addCheckConstraint("chk_deck_check_entries_notes", sql`notes IS NULL OR length(notes) <= 4000`)
    .addUniqueConstraint("uq_deck_check_entries_event_external", ["event_id", "external_id"])
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint("deck_check_entries_event_fkey", ["event_id"], "deck_check_events", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint("deck_check_entries_checked_by_fkey", ["checked_by"], "users", ["id"])
    .onDelete("set null")
    .execute();

  await db.schema
    .createIndex("idx_deck_check_entries_event")
    .on("deck_check_entries")
    .column("event_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_check_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 4. deck_check_entry_cards ──────────────────────────────────────────────
  await db.schema
    .createTable("deck_check_entry_cards")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("entry_id", "uuid", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.notNull())
    .addColumn("raw_name", "text", (col) => col.notNull())
    .addColumn("section", "text", (col) => col.notNull())
    .addColumn("zone", "text", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull())
    .addColumn("resolved_card_id", "uuid")
    .addColumn("resolved_printing_id", "uuid")
    .addColumn("match_status", "text", (col) => col.notNull())
    .addColumn("found_copies", sql`boolean[]`, (col) => col.defaultTo(sql`'{}'`).notNull())
    .addCheckConstraint("chk_deck_check_entry_cards_quantity", sql`quantity > 0`)
    .addCheckConstraint(
      "chk_deck_check_entry_cards_found",
      sql`cardinality(found_copies) <= quantity`,
    )
    .addCheckConstraint(
      "chk_deck_check_entry_cards_match",
      sql`match_status IN ('matched', 'ambiguous', 'unmatched')`,
    )
    .execute();

  await db.schema
    .alterTable("deck_check_entry_cards")
    .addForeignKeyConstraint(
      "deck_check_entry_cards_entry_fkey",
      ["entry_id"],
      "deck_check_entries",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_check_entry_cards")
    .addForeignKeyConstraint("deck_check_entry_cards_zone_fkey", ["zone"], "deck_zones", ["slug"])
    .execute();

  await db.schema
    .alterTable("deck_check_entry_cards")
    .addForeignKeyConstraint("deck_check_entry_cards_card_fkey", ["resolved_card_id"], "cards", [
      "id",
    ])
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("deck_check_entry_cards")
    .addForeignKeyConstraint(
      "deck_check_entry_cards_printing_fkey",
      ["resolved_printing_id"],
      "printings",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .createIndex("idx_deck_check_entry_cards_entry")
    .on("deck_check_entry_cards")
    .column("entry_id")
    .execute();

  // ── 5. deck_check_keys ─────────────────────────────────────────────────────
  await db.schema
    .createTable("deck_check_keys")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("token_prefix", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .addColumn("created_by", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("last_used_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addCheckConstraint("chk_deck_check_keys_label", sql`label IS NULL OR length(label) <= 120`)
    .execute();

  await db.schema
    .alterTable("deck_check_keys")
    .addForeignKeyConstraint("deck_check_keys_group_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_check_keys")
    .addForeignKeyConstraint("deck_check_keys_created_by_fkey", ["created_by"], "users", ["id"])
    .onDelete("set null")
    .execute();

  await db.schema
    .createIndex("idx_deck_check_keys_group")
    .on("deck_check_keys")
    .column("group_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("deck_check_keys").execute();
  await db.schema.dropTable("deck_check_entry_cards").execute();
  await db.schema.dropTable("deck_check_entries").execute();
  await db.schema.dropTable("deck_check_events").execute();

  // Any 'judge' rows must be demoted before the narrower CHECK can be restored.
  await sql`
    UPDATE friend_group_members SET role = 'member' WHERE role = 'judge'
  `.execute(db);
  await sql`
    ALTER TABLE friend_group_members
      DROP CONSTRAINT chk_friend_group_members_role
  `.execute(db);
  await sql`
    ALTER TABLE friend_group_members
      ADD CONSTRAINT chk_friend_group_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  `.execute(db);
}
