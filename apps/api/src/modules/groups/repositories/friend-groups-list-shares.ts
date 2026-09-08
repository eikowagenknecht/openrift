import { sql } from "kysely";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { GroupShare } from "./friend-groups-shared.js";

export function friendGroupListSharesRepo(db: Kysely<Database>) {
  return {
    listSharesForGroup(groupId: string): Promise<
      (GroupShare & {
        listName: string;
        listIntent: string;
        listKind: string;
        entryCount: number;
        hasRule: boolean;
        userName: string | null;
      })[]
    > {
      return db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("users as u", "u.id", "s.userId")
        .selectAll("s")
        .select([
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          // Cheap materialized-row count. Exact for manual lists; rule-based
          // lists report 0 here and get an expanded count in the route.
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = l.id)`.as(
            "entryCount",
          ),
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
          "u.name as userName",
        ])
        .where("s.groupId", "=", groupId)
        .execute();
    },

    listShareableForUserInGroup(
      groupId: string,
      userId: string,
    ): Promise<
      {
        listId: string;
        listName: string;
        listIntent: string;
        listKind: string;
        entryCount: number;
        sharedAt: Date | null;
        defaultPricePref: string | null;
        defaultPriceAbsoluteCents: number | null;
        defaultTradeType: string | null;
        currency: string | null;
        hasRule: boolean;
      }[]
    > {
      return db
        .selectFrom("lists as l")
        .leftJoin("friendGroupListShares as s", (join) =>
          join.onRef("s.listId", "=", "l.id").on("s.groupId", "=", groupId),
        )
        .select([
          "l.id as listId",
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = l.id)`.as(
            "entryCount",
          ),
          "s.sharedAt as sharedAt",
          "l.defaultPricePref",
          "l.defaultPriceAbsoluteCents",
          "l.defaultTradeType",
          "l.currency",
          // Summaries report the rule flag, never the expanded count.
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
        ])
        .where("l.userId", "=", userId)
        .orderBy("l.intent", "asc")
        .orderBy("l.name", "asc")
        .execute();
    },

    listGroupsSharingList(
      listId: string,
    ): Promise<{ groupId: string; groupSlug: string; groupName: string }[]> {
      return db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug", "g.name as groupName"])
        .where("s.listId", "=", listId)
        .orderBy("g.name", "asc")
        .execute();
    },

    /**
     * `user_id` is denormalised so the composite FK to friend_group_members
     * enforces "you can only share into a group you're a member of".
     */
    async share(groupId: string, listId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupListShares")
        .values({ groupId, listId, userId })
        .onConflict((oc) => oc.columns(["groupId", "listId"]).doNothing())
        .execute();
    },

    async unshare(groupId: string, listId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupListShares")
        .where("groupId", "=", groupId)
        .where("listId", "=", listId)
        .execute();
    },

    async getSharedList(
      groupId: string,
      listId: string,
      viewerUserId: string,
    ): Promise<
      | {
          list: {
            id: string;
            userId: string;
            name: string;
            intent: string;
            kind: string;
            defaultPricePref: string | null;
            defaultPriceAbsoluteCents: number | null;
            defaultTradeType: string | null;
            currency: string | null;
          };
          ownerName: string | null;
        }
      | undefined
    > {
      const viewerMembership = await db
        .selectFrom("friendGroupMembers")
        .select("role")
        .where("groupId", "=", groupId)
        .where("userId", "=", viewerUserId)
        .executeTakeFirst();
      if (!viewerMembership) {
        return undefined;
      }

      const row = await db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("users as u", "u.id", "l.userId")
        .select([
          "l.id as listId",
          "l.userId as listUserId",
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          "l.defaultPricePref",
          "l.defaultPriceAbsoluteCents",
          "l.defaultTradeType",
          "l.currency",
          "u.name as ownerName",
        ])
        .where("s.groupId", "=", groupId)
        .where("s.listId", "=", listId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }

      return {
        list: {
          id: row.listId,
          userId: row.listUserId,
          name: row.listName,
          intent: row.listIntent,
          kind: row.listKind,
          defaultPricePref: row.defaultPricePref,
          defaultPriceAbsoluteCents: row.defaultPriceAbsoluteCents,
          defaultTradeType: row.defaultTradeType,
          currency: row.currency,
        },
        ownerName: row.ownerName,
      };
    },
  };
}
