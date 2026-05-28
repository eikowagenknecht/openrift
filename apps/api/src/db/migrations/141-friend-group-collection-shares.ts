import type { Kysely } from "kysely";
import { sql } from "kysely";

// Read-only collection shares to friend groups. Mirrors
// friend_group_list_shares: a user opts in their personal collection to be
// visible (read-only) to members of one of their groups.
//
// Composite FK on (user_id, group_id) → friend_group_members cascades on
// leave/kick — same trick as the list-shares table.
//
// Pooled (group-owned) collections must not appear here: they already grant
// access via membership, and a second access path through this table would
// be confusing. We enforce that via a composite FK to collections(id, user_id).
// The collections table already carries a UNIQUE(id, user_id) constraint
// (`uq_collections_id_user`, from migration 001) which serves as the FK
// target. Rows with user_id IS NULL (pooled collections) can never satisfy
// the FK because the share row's user_id is NOT NULL.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("friend_group_collection_shares")
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("collection_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("shared_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("friend_group_collection_shares_pkey", ["group_id", "collection_id"])
    .execute();

  // Personal collections only: composite FK forces collection.user_id to
  // equal the share's user_id. Pooled collections have user_id IS NULL and
  // can never match.
  await db.schema
    .alterTable("friend_group_collection_shares")
    .addForeignKeyConstraint(
      "fk_friend_group_collection_shares_collection",
      ["collection_id", "user_id"],
      "collections",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  // Cascade on leave/kick: dropping the membership row drops the shares.
  await db.schema
    .alterTable("friend_group_collection_shares")
    .addForeignKeyConstraint(
      "fk_friend_group_collection_shares_membership",
      ["user_id", "group_id"],
      "friend_group_members",
      ["user_id", "group_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_friend_group_collection_shares_group")
    .on("friend_group_collection_shares")
    .column("group_id")
    .execute();

  await db.schema
    .createIndex("idx_friend_group_collection_shares_collection")
    .on("friend_group_collection_shares")
    .column("collection_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("friend_group_collection_shares").execute();
}
