// oxlint-disable promise/prefer-await-to-callbacks -- Kysely's addForeignKeyConstraint takes a constraint-builder callback, not a node-style errback
import type { Kysely } from "kysely";
import { sql } from "kysely";

// Structured contact methods (replaces the per-group `nickname` free-text line).
//
// Two tables: user_contact_methods holds a user's account-level channels
// (Discord, Signal, phone, …), reusable across every group they're in;
// friend_group_member_contacts records which of those channels a member has
// opted to reveal to a given group (group-wide visibility, ADR-013 privacy).
//
// The composite FK on (group_id, user_id) → friend_group_members rides the same
// cascade trick as the list shares: leaving or being kicked drops the membership
// row and takes the reveal rows with it. Deleting a contact method cascades to
// its reveal rows too. (That a revealed method belongs to the revealing user is
// enforced in the repository, not by a constraint.)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_contact_methods")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addForeignKeyConstraint(
      "user_contact_methods_user_id_fkey",
      ["user_id"],
      "users",
      ["id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addCheckConstraint(
      "chk_user_contact_methods_type",
      sql`type = ANY (ARRAY['discord'::text, 'signal'::text, 'telegram'::text, 'whatsapp'::text, 'phone'::text, 'email'::text, 'in_person'::text, 'other'::text])`,
    )
    .addCheckConstraint("chk_user_contact_methods_value", sql`length(value) BETWEEN 1 AND 200`)
    .execute();

  await db.schema
    .createIndex("idx_user_contact_methods_user")
    .on("user_contact_methods")
    .column("user_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON user_contact_methods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await db.schema
    .createTable("friend_group_member_contacts")
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("contact_method_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("friend_group_member_contacts_pkey", [
      "group_id",
      "user_id",
      "contact_method_id",
    ])
    .addForeignKeyConstraint(
      "friend_group_member_contacts_member_fkey",
      ["group_id", "user_id"],
      "friend_group_members",
      ["group_id", "user_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "friend_group_member_contacts_method_fkey",
      ["contact_method_id"],
      "user_contact_methods",
      ["id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("idx_friend_group_member_contacts_member")
    .on("friend_group_member_contacts")
    .columns(["group_id", "user_id"])
    .execute();

  // The old free-text per-group contact line is superseded.
  await db.schema
    .alterTable("friend_group_members")
    .dropConstraint("chk_friend_group_members_nickname")
    .execute();
  await db.schema.alterTable("friend_group_members").dropColumn("nickname").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("friend_group_members").addColumn("nickname", "text").execute();
  await db.schema
    .alterTable("friend_group_members")
    .addCheckConstraint(
      "chk_friend_group_members_nickname",
      sql`nickname IS NULL OR length(nickname) <= 80`,
    )
    .execute();

  await db.schema.dropTable("friend_group_member_contacts").execute();
  await db.schema.dropTable("user_contact_methods").execute();
}
