import type { Kysely, Selectable } from "kysely";

import type { Database, FriendGroupDiscordLinksTable } from "../db/index.js";

export type DiscordLink = Selectable<FriendGroupDiscordLinksTable>;

/** Where a redeem attempt landed; `guild-taken` means another group holds the guild. */
export type RedeemResult =
  | { status: "linked"; link: DiscordLink }
  | { status: "unknown-code" }
  | { status: "guild-taken" };

/**
 * Discord-server links for friend groups (migration 217). A link starts as a
 * pending row holding a one-time code; the bot's /link command redeems it,
 * binding the guild to the group. Authorization is the caller's job (admin
 * role for code management, the bot's service secret for redeeming).
 *
 * @returns An object with the discord-link queries bound to the given `db`.
 */
export function friendGroupDiscordLinksRepo(db: Kysely<Database>) {
  return {
    /**
     * Creates a fresh pending link code for a group, replacing any earlier
     * pending code (one outstanding code per group). Expired pending rows of
     * other groups are swept opportunistically — they are dead weight nothing
     * else deletes.
     * @returns The pending link row carrying the new code.
     */
    async createPendingLink(values: {
      groupId: string;
      createdByUserId: string;
      code: string;
      codeExpiresAt: Date;
    }): Promise<DiscordLink> {
      await db
        .deleteFrom("friendGroupDiscordLinks")
        .where((eb) =>
          eb.or([
            eb.and([eb("groupId", "=", values.groupId), eb("code", "is not", null)]),
            eb.and([eb("code", "is not", null), eb("codeExpiresAt", "<", new Date())]),
          ]),
        )
        .execute();
      return await db
        .insertInto("friendGroupDiscordLinks")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Redeems a pending code, turning it into a live guild link. Redeeming the
     * same guild into the group it is already linked to consumes the code and
     * returns the existing link (idempotent re-link); a guild held by another
     * group is a conflict.
     * @returns The redeem outcome (see {@link RedeemResult}).
     */
    async redeemCode(values: {
      code: string;
      guildId: string;
      guildName: string | null;
    }): Promise<RedeemResult> {
      const pending = await db
        .selectFrom("friendGroupDiscordLinks")
        .selectAll()
        .where("code", "=", values.code)
        .where("codeExpiresAt", ">", new Date())
        .executeTakeFirst();
      if (!pending) {
        return { status: "unknown-code" };
      }
      const existing = await db
        .selectFrom("friendGroupDiscordLinks")
        .selectAll()
        .where("guildId", "=", values.guildId)
        .executeTakeFirst();
      if (existing) {
        if (existing.groupId !== pending.groupId) {
          return { status: "guild-taken" };
        }
        // Same guild, same group: refresh the name, drop the pending row.
        const link = await db
          .updateTable("friendGroupDiscordLinks")
          .set({ guildName: values.guildName })
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await db.deleteFrom("friendGroupDiscordLinks").where("id", "=", pending.id).execute();
        return { status: "linked", link };
      }
      const link = await db
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
    },

    /**
     * The group's live links (pending codes excluded), oldest first.
     * @returns The linked-guild rows for the group.
     */
    listLinks(groupId: string): Promise<DiscordLink[]> {
      return db
        .selectFrom("friendGroupDiscordLinks")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("guildId", "is not", null)
        .orderBy("linkedAt", "asc")
        .execute();
    },

    /**
     * Unlinks one guild (or discards a pending code) belonging to the group.
     * @returns True when a row was deleted.
     */
    async deleteLink(groupId: string, linkId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("friendGroupDiscordLinks")
        .where("id", "=", linkId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    /**
     * Resolves a guild to its linked group, if any.
     * @returns The link joined with the group's id, slug, and name, or undefined.
     */
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
