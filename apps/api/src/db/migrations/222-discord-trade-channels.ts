import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Marks channels of a linked Discord server as trade channels. In those
 * channels the bot scans ordinary messages for card names and posts the
 * offers its linked group holds, so a want-list post gets answered without
 * anyone knowing the bot is there.
 *
 * The list rides on the existing guild link rather than a table of its own:
 * the scoping unit is the server, one linked row already exists per guild, and
 * the bot reads the whole map into memory anyway (a per-message lookup cannot
 * afford a query). Empty is the safe default — an already-linked server scans
 * nothing until someone opts a channel in.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("friend_group_discord_links")
    // Discord channel snowflakes, stored as text like every external id.
    .addColumn("trade_channel_ids", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .execute();

  // Only linked rows can carry channels; a pending code has no guild yet.
  await db.schema
    .alterTable("friend_group_discord_links")
    .addCheckConstraint(
      "chk_fg_discord_links_trade_channels",
      sql`guild_id IS NOT NULL OR cardinality(trade_channel_ids) = 0`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("friend_group_discord_links")
    .dropConstraint("chk_fg_discord_links_trade_channels")
    .execute();
  await db.schema
    .alterTable("friend_group_discord_links")
    .dropColumn("trade_channel_ids")
    .execute();
}
