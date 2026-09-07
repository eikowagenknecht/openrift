import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { FriendGroupDiscordLinksTable } from "../../../db/tables/friend-groups.js";

export type DiscordLink = Selectable<FriendGroupDiscordLinksTable>;

/** Where a redeem attempt landed; `guild-taken` means another group holds the guild. */
export type RedeemResult =
  | { status: "linked"; link: DiscordLink }
  | { status: "unknown-code" }
  | { status: "guild-taken" };

// A link starts as a pending row with a one-time code; /link redeems it into
// a live guild binding. Authorization is the caller's job.
export function friendGroupDiscordLinksRepo(db: Kysely<Database>) {
  return {
    // Replaces any earlier pending code for the group, and opportunistically
    // sweeps expired pending rows of other groups (nothing else deletes them).
    createPendingLink(values: {
      groupId: string;
      createdByUserId: string;
      code: string;
      codeExpiresAt: Date;
    }): Promise<DiscordLink> {
      // Delete + insert share a transaction so two concurrent requests can't
      // interleave into two live codes; the partial unique index on pending
      // rows rejects whichever loser slips through anyway.
      const run = async (trx: typeof db): Promise<DiscordLink> => {
        await trx
          .deleteFrom("friendGroupDiscordLinks")
          .where((eb) =>
            eb.or([
              eb.and([eb("groupId", "=", values.groupId), eb("code", "is not", null)]),
              eb.and([eb("code", "is not", null), eb("codeExpiresAt", "<", new Date())]),
            ]),
          )
          .execute();
        return await trx
          .insertInto("friendGroupDiscordLinks")
          .values(values)
          .returningAll()
          .executeTakeFirstOrThrow();
      };
      return db.isTransaction ? run(db) : db.transaction().execute(run);
    },

    // Re-linking the same guild to its current group is idempotent; a guild
    // held by another group conflicts and leaves the code unspent.
    redeemCode(values: {
      code: string;
      guildId: string;
      guildName: string | null;
    }): Promise<RedeemResult> {
      const run = async (trx: Kysely<Database>): Promise<RedeemResult> => {
        const pending = await trx
          .selectFrom("friendGroupDiscordLinks")
          .selectAll()
          .where("code", "=", values.code)
          .where("codeExpiresAt", ">", new Date())
          .forUpdate()
          .executeTakeFirst();
        if (!pending) {
          return { status: "unknown-code" };
        }
        // Locked too: a concurrent redeem for the same guild must wait here.
        const existing = await trx
          .selectFrom("friendGroupDiscordLinks")
          .selectAll()
          .where("guildId", "=", values.guildId)
          .forUpdate()
          .executeTakeFirst();
        if (existing) {
          if (existing.groupId !== pending.groupId) {
            // Nothing written, so the code survives for a correct retry.
            return { status: "guild-taken" };
          }
          const link = await trx
            .updateTable("friendGroupDiscordLinks")
            .set({ guildName: values.guildName })
            .where("id", "=", existing.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          await trx.deleteFrom("friendGroupDiscordLinks").where("id", "=", pending.id).execute();
          return { status: "linked", link };
        }
        const link = await trx
          .updateTable("friendGroupDiscordLinks")
          .set({
            guildId: values.guildId,
            guildName: values.guildName,
            linkedAt: new Date(),
            code: null,
            codeExpiresAt: null,
          })
          .where("id", "=", pending.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return { status: "linked", link };
      };
      return db.isTransaction ? run(db) : db.transaction().execute(run);
    },

    listLinks(groupId: string): Promise<DiscordLink[]> {
      return db
        .selectFrom("friendGroupDiscordLinks")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("guildId", "is not", null)
        .orderBy("linkedAt", "asc")
        .execute();
    },

    async deleteLink(groupId: string, linkId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("friendGroupDiscordLinks")
        .where("id", "=", linkId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    async setTradeChannel(values: {
      guildId: string;
      channelId: string;
      enabled: boolean;
    }): Promise<string[] | null> {
      // One atomic UPDATE, computed in SQL: a read-modify-write here lost one
      // of two quick toggles to the other's stale snapshot.
      const updated = await db
        .updateTable("friendGroupDiscordLinks")
        .set({
          tradeChannelIds: values.enabled
            ? sql<string[]>`(
                SELECT coalesce(array_agg(DISTINCT v ORDER BY v), '{}')
                FROM unnest(array_append(trade_channel_ids, ${values.channelId})) AS t(v)
              )`
            : sql<string[]>`array_remove(trade_channel_ids, ${values.channelId})`,
        })
        .where("guildId", "=", values.guildId)
        .returning("tradeChannelIds")
        .executeTakeFirst();
      return updated?.tradeChannelIds ?? null;
    },

    // The bot caches this in memory and refreshes it periodically, since
    // deciding whether to scan runs on every message.
    listTradeChannels(): Promise<{ guildId: string; channelIds: string[] }[]> {
      return db
        .selectFrom("friendGroupDiscordLinks")
        .select(["guildId", "tradeChannelIds as channelIds"])
        .where("guildId", "is not", null)
        .where(({ eb, fn }) => eb(fn("cardinality", ["tradeChannelIds"]), ">", 0))
        .orderBy("guildId", "asc")
        .execute() as Promise<{ guildId: string; channelIds: string[] }[]>;
    },

    findByGuildId(
      guildId: string,
    ): Promise<{ groupId: string; groupSlug: string; groupName: string } | undefined> {
      return db
        .selectFrom("friendGroupDiscordLinks as l")
        .innerJoin("friendGroups as g", "g.id", "l.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug", "g.name as groupName"])
        .where("l.guildId", "=", guildId)
        .executeTakeFirst();
    },
  };
}
