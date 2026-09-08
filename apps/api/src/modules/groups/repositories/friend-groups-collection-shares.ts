import type { FriendGroupRole } from "@openrift/shared/types/api/friend-group";
import { sql } from "kysely";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { GroupCollectionShare } from "./friend-groups-shared.js";

export function friendGroupCollectionSharesRepo(db: Kysely<Database>) {
  return {
    /**
     * Pooled (group-owned) collections never appear here: they're enforced
     * out by the composite FK to collections(id, user_id).
     */
    collectionSharesForGroup(groupId: string): Promise<
      (GroupCollectionShare & {
        collectionName: string;
        collectionSortOrder: number;
        userName: string | null;
        copyCount: number;
      })[]
    > {
      return db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("users as u", "u.id", "s.userId")
        .selectAll("s")
        .select([
          "c.name as collectionName",
          "c.sortOrder as collectionSortOrder",
          "u.name as userName",
          sql<number>`(select count(*)::int from copies cp where cp.collection_id = s.collection_id)`.as(
            "copyCount",
          ),
        ])
        .where("s.groupId", "=", groupId)
        .orderBy("u.name", "asc")
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();
    },

    collectionShareableForUserInGroup(
      groupId: string,
      userId: string,
    ): Promise<
      {
        collectionId: string;
        collectionName: string;
        sharedAt: Date | null;
      }[]
    > {
      return db
        .selectFrom("collections as c")
        .leftJoin("friendGroupCollectionShares as s", (join) =>
          join.onRef("s.collectionId", "=", "c.id").on("s.groupId", "=", groupId),
        )
        .select(["c.id as collectionId", "c.name as collectionName", "s.sharedAt as sharedAt"])
        .where("c.userId", "=", userId)
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();
    },

    groupsSharingCollection(
      collectionId: string,
    ): Promise<{ groupId: string; groupSlug: string; groupName: string }[]> {
      return db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug", "g.name as groupName"])
        .where("s.collectionId", "=", collectionId)
        .orderBy("g.name", "asc")
        .execute();
    },

    /**
     * The composite FK to friend_group_members(user_id, group_id) enforces
     * "you can only share into a group you're a member of"; the composite FK
     * to collections(id, user_id) blocks pooled collections.
     */
    async shareCollection(groupId: string, collectionId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupCollectionShares")
        .values({ groupId, collectionId, userId })
        .onConflict((oc) => oc.columns(["groupId", "collectionId"]).doNothing())
        .execute();
    },

    async unshareCollection(groupId: string, collectionId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupCollectionShares")
        .where("groupId", "=", groupId)
        .where("collectionId", "=", collectionId)
        .execute();
    },

    async getSharedCollection(
      groupId: string,
      collectionId: string,
      viewerUserId: string,
    ): Promise<
      | {
          collection: {
            id: string;
            userId: string;
            name: string;
            description: string | null;
            sortOrder: number;
          };
          ownerName: string | null;
          viewerRole: FriendGroupRole;
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
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("users as u", "u.id", "s.userId")
        .select([
          "c.id as collectionId",
          "s.userId as ownerUserId",
          "c.name as collectionName",
          "c.description as collectionDescription",
          "c.sortOrder as collectionSortOrder",
          "u.name as ownerName",
        ])
        .where("s.groupId", "=", groupId)
        .where("s.collectionId", "=", collectionId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }

      return {
        collection: {
          id: row.collectionId,
          userId: row.ownerUserId,
          name: row.collectionName,
          description: row.collectionDescription,
          sortOrder: row.collectionSortOrder,
        },
        ownerName: row.ownerName,
        viewerRole: viewerMembership.role as FriendGroupRole,
      };
    },

    async viewerCanReadCollection(viewerUserId: string, collectionId: string): Promise<boolean> {
      const row = await db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("friendGroupMembers as m", (join) =>
          join.onRef("m.groupId", "=", "s.groupId").on("m.userId", "=", viewerUserId),
        )
        .select(sql<number>`1`.as("one"))
        .where("s.collectionId", "=", collectionId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    async collectionsBundleForViewer(
      ownerUserId: string,
      viewerUserId: string,
    ): Promise<
      {
        collectionId: string;
        collectionName: string;
        collectionDescription: string | null;
        viaGroups: { id: string; slug: string; name: string }[];
      }[]
    > {
      const rows = await db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .innerJoin("friendGroupMembers as m", (join) =>
          join.onRef("m.groupId", "=", "s.groupId").on("m.userId", "=", viewerUserId),
        )
        .select([
          "c.id as collectionId",
          "c.name as collectionName",
          "c.description as collectionDescription",
          "g.id as groupId",
          "g.slug as groupSlug",
          "g.name as groupName",
        ])
        .where("s.userId", "=", ownerUserId)
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();

      const byCollection = new Map<
        string,
        {
          collectionId: string;
          collectionName: string;
          collectionDescription: string | null;
          viaGroups: { id: string; slug: string; name: string }[];
        }
      >();
      for (const row of rows) {
        let entry = byCollection.get(row.collectionId);
        if (!entry) {
          entry = {
            collectionId: row.collectionId,
            collectionName: row.collectionName,
            collectionDescription: row.collectionDescription,
            viaGroups: [],
          };
          byCollection.set(row.collectionId, entry);
        }
        entry.viaGroups.push({ id: row.groupId, slug: row.groupSlug, name: row.groupName });
      }
      return [...byCollection.values()];
    },
  };
}
