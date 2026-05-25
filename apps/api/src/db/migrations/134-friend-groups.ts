import type { Kysely } from "kysely";
import { sql } from "kysely";

// Friend groups for trading discovery (ADR-013).
//
// Four tables: friend_groups (the social unit), friend_group_members
// (membership + role), friend_group_invites (pending invites in both
// directions), friend_group_list_shares (which of a user's lists are opted
// into which group). The match view is read-only and computed at query time
// against lists + list_entries — no materialisation here.
//
// Composite FK on friend_group_list_shares.(user_id, group_id) →
// friend_group_members.(user_id, group_id) is the load-bearing trick: kick
// or leave drops the membership row and cascades the user's shares away
// with it, no separate cleanup needed.
//
// rebalance_friend_group_owner trigger auto-promotes a successor when an
// owner row disappears — typically the user-deletion cascade. The API
// layer is still responsible for blocking "owner clicks leave" without
// transferring first, because the trigger can't tell those cases apart.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. friend_groups ─────────────────────────────────────────────────────
  await db.schema
    .createTable("friend_groups")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("code", "text")
    .addColumn("code_rotated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_friend_groups_slug", sql`slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'`)
    .addCheckConstraint("chk_friend_groups_name", sql`length(name) BETWEEN 1 AND 60`)
    .addCheckConstraint(
      "chk_friend_groups_description",
      sql`description IS NULL OR length(description) <= 500`,
    )
    .execute();

  // Partial unique on code: codes can be NULL (invite-only mode) but two
  // groups sharing the same non-null code would make /groups/join ambiguous.
  await sql`
    CREATE UNIQUE INDEX uq_friend_groups_code
      ON friend_groups (code) WHERE code IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON friend_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 2. friend_group_members ──────────────────────────────────────────────
  await db.schema
    .createTable("friend_group_members")
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("nickname", "text")
    .addColumn("joined_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("friend_group_members_pkey", ["group_id", "user_id"])
    .addCheckConstraint(
      "chk_friend_group_members_role",
      sql`role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])`,
    )
    .addCheckConstraint(
      "chk_friend_group_members_nickname",
      sql`nickname IS NULL OR length(nickname) <= 80`,
    )
    .execute();

  // Inverse-ordered UNIQUE so friend_group_list_shares can FK to
  // (user_id, group_id). PG uniqueness is order-sensitive for the FK target.
  await db.schema
    .alterTable("friend_group_members")
    .addUniqueConstraint("uq_friend_group_members_user_group", ["user_id", "group_id"])
    .execute();

  await db.schema
    .alterTable("friend_group_members")
    .addForeignKeyConstraint("friend_group_members_group_id_fkey", ["group_id"], "friend_groups", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("friend_group_members")
    .addForeignKeyConstraint("friend_group_members_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // Exactly one owner per group at the schema level.
  await sql`
    CREATE UNIQUE INDEX uq_friend_group_one_owner
      ON friend_group_members (group_id) WHERE role = 'owner'
  `.execute(db);

  await db.schema
    .createIndex("idx_friend_group_members_user")
    .on("friend_group_members")
    .column("user_id")
    .execute();

  // ── 3. friend_group_invites ──────────────────────────────────────────────
  // Both directions in one table — direction='invite' is admin→user,
  // direction='request' is user→group. UNIQUE(group_id, user_id) dedupes
  // and prevents spam: a user can have at most one pending row per group.
  await db.schema
    .createTable("friend_group_invites")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("direction", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addUniqueConstraint("uq_friend_group_invites_group_user", ["group_id", "user_id"])
    .addCheckConstraint(
      "chk_friend_group_invites_direction",
      sql`direction = ANY (ARRAY['invite'::text, 'request'::text])`,
    )
    .execute();

  await db.schema
    .alterTable("friend_group_invites")
    .addForeignKeyConstraint("friend_group_invites_group_id_fkey", ["group_id"], "friend_groups", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("friend_group_invites")
    .addForeignKeyConstraint("friend_group_invites_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_friend_group_invites_user")
    .on("friend_group_invites")
    .column("user_id")
    .execute();

  // ── 4. friend_group_list_shares ──────────────────────────────────────────
  // PK on (group_id, list_id) — a list is shared with a group at most once.
  // user_id is denormalised so the composite FK to friend_group_members can
  // cascade-delete shares when the membership row disappears (leave/kick).
  await db.schema
    .createTable("friend_group_list_shares")
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("shared_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("friend_group_list_shares_pkey", ["group_id", "list_id"])
    .execute();

  await db.schema
    .alterTable("friend_group_list_shares")
    .addForeignKeyConstraint("friend_group_list_shares_list_id_fkey", ["list_id"], "lists", ["id"])
    .onDelete("cascade")
    .execute();

  // The composite FK to membership is what makes auto-revoke on leave/kick
  // free. Drop the membership row → shares vanish.
  await db.schema
    .alterTable("friend_group_list_shares")
    .addForeignKeyConstraint(
      "fk_friend_group_list_shares_membership",
      ["user_id", "group_id"],
      "friend_group_members",
      ["user_id", "group_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_friend_group_list_shares_group")
    .on("friend_group_list_shares")
    .column("group_id")
    .execute();

  await db.schema
    .createIndex("idx_friend_group_list_shares_list")
    .on("friend_group_list_shares")
    .column("list_id")
    .execute();

  // ── 5. Owner-rebalance trigger ───────────────────────────────────────────
  // Fires when ANY membership row is deleted; only acts on owner rows. Picks
  // the oldest admin (or oldest plain member) as successor. If the deleted
  // owner was the last person in the group, the group itself is deleted.
  //
  // This handles the user-account-deletion cascade cleanly. "Owner clicks
  // leave without transferring" is rejected by the API before reaching the
  // trigger — the trigger can't distinguish those cases, so it just runs.
  await sql`
    CREATE FUNCTION rebalance_friend_group_owner() RETURNS trigger AS $$
    DECLARE
      successor RECORD;
    BEGIN
      IF OLD.role <> 'owner' THEN
        RETURN OLD;
      END IF;

      SELECT user_id INTO successor
      FROM friend_group_members
      WHERE group_id = OLD.group_id
      ORDER BY (role = 'admin') DESC, joined_at ASC
      LIMIT 1;

      IF FOUND THEN
        UPDATE friend_group_members
           SET role = 'owner'
         WHERE group_id = OLD.group_id AND user_id = successor.user_id;
      ELSE
        DELETE FROM friend_groups WHERE id = OLD.group_id;
      END IF;

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_rebalance_friend_group_owner
      AFTER DELETE ON friend_group_members
      FOR EACH ROW EXECUTE FUNCTION rebalance_friend_group_owner()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_rebalance_friend_group_owner ON friend_group_members`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS rebalance_friend_group_owner()`.execute(db);

  await db.schema.dropTable("friend_group_list_shares").execute();
  await db.schema.dropTable("friend_group_invites").execute();
  await db.schema.dropTable("friend_group_members").execute();
  await db.schema.dropTable("friend_groups").execute();
}
