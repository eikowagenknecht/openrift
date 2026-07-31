import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Links a Discord server (guild) to a friend group so the Discord bot can
 * answer group-scoped questions (who has a mentioned card on a shared
 * tradelist).
 *
 * A row is created *pending* by a group admin (code set, guild_id null) and
 * becomes *linked* when someone with Manage Server permission redeems the code
 * via the bot's /link command (guild_id set, code cleared). Linking the server
 * is the group's consent that bot replies in that server may name members and
 * their shared-tradelist cards.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("friend_group_discord_links")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    // Discord snowflakes are 64-bit ints; stored as text like every external id.
    .addColumn("guild_id", "text")
    // Captured at redeem time for display in group settings; never re-synced.
    .addColumn("guild_name", "text")
    .addColumn("code", "text")
    .addColumn("code_expires_at", "timestamptz")
    // Who generated the code. SET NULL: the link outlives the admin's account.
    .addColumn("created_by_user_id", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("linked_at", "timestamptz")
    // Exactly one state: pending (code, no guild) or linked (guild, no code).
    .addCheckConstraint("chk_fg_discord_links_state", sql`(guild_id IS NULL) <> (code IS NULL)`)
    .addCheckConstraint(
      "chk_fg_discord_links_pending_expiry",
      sql`code IS NULL OR code_expires_at IS NOT NULL`,
    )
    .addCheckConstraint(
      "chk_fg_discord_links_linked_at",
      sql`(guild_id IS NULL) = (linked_at IS NULL)`,
    )
    .execute();

  await db.schema
    .alterTable("friend_group_discord_links")
    .addForeignKeyConstraint(
      "friend_group_discord_links_group_id_fkey",
      ["group_id"],
      "friend_groups",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("friend_group_discord_links")
    .addForeignKeyConstraint(
      "friend_group_discord_links_created_by_user_id_fkey",
      ["created_by_user_id"],
      "users",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  // One group per guild — the bot resolves a guild to exactly one group.
  await db.schema
    .createIndex("uq_fg_discord_links_guild")
    .on("friend_group_discord_links")
    .column("guild_id")
    .unique()
    .where(sql.ref("guild_id"), "is not", null)
    .execute();

  await db.schema
    .createIndex("uq_fg_discord_links_code")
    .on("friend_group_discord_links")
    .column("code")
    .unique()
    .where(sql.ref("code"), "is not", null)
    .execute();

  await db.schema
    .createIndex("idx_fg_discord_links_group")
    .on("friend_group_discord_links")
    .column("group_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("friend_group_discord_links").execute();
}
