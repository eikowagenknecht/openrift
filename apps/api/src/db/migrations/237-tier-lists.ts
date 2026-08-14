import type { Kysely } from "kysely";
import { sql } from "kysely";

// Creator-authored tier lists: an ordered set of labelled rows, each holding an
// ordered list of card ids. The whole board lives in one `tiers` jsonb column
// rather than a rows table plus an entries table, because a tier list is only
// ever read and written whole — the builder loads the board, the user drags
// cards around, and one save replaces it. Rows have no identity outside their
// position, so there is nothing for a foreign key to point at.
//
// Granularity is per card, not per printing: a tier list ranks "Yasuo", not a
// particular art of him, so display art comes from the card's default printing
// at render time. Card ids are therefore stored bare, with no FK — a card
// removed from the catalogue simply stops resolving and is skipped by the
// reader, which is the same tolerance the deck-image renderer already has.
//
// Sharing mirrors decks and lists exactly: a nullable share_token plus an
// is_public flag, so an unshared list has no live URL at all.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tier_lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    // Optional scope hint. The card pool is the whole catalogue, so this does
    // not gate anything — it seeds the builder's set filter and labels the
    // share page. ON DELETE SET NULL because losing the set should orphan the
    // hint, never the list.
    .addColumn("set_id", "uuid")
    .addColumn("tiers", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("is_public", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_tier_lists_title_not_empty", sql`title <> ''`)
    // The reader trusts the shape (parseJsonbRequired, no per-row validation),
    // so the database enforces that it is at least an array.
    .addCheckConstraint("chk_tier_lists_tiers_array", sql`jsonb_typeof(tiers) = 'array'`)
    .execute();

  await db.schema
    .alterTable("tier_lists")
    .addForeignKeyConstraint("tier_lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("tier_lists")
    .addForeignKeyConstraint("tier_lists_set_id_fkey", ["set_id"], "sets", ["id"])
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("tier_lists")
    .addUniqueConstraint("tier_lists_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .createIndex("idx_tier_lists_user_id")
    .on("tier_lists")
    .column("user_id")
    .execute();

  // The share image's `?v=` cache-bust reads updated_at, so it must advance on
  // every edit. Saves go through the app layer, but the trigger keeps that true
  // for one-off admin fixes too (the same reasoning as ADR-024's list trigger).
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON tier_lists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tier_lists").execute();
}
