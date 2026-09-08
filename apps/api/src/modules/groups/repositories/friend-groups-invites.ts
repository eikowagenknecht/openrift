import type { FriendGroupInviteDirection } from "@openrift/shared/types/api/friend-group";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { GroupInvite } from "./friend-groups-shared.js";

export function friendGroupInvitesRepo(db: Kysely<Database>) {
  return {
    getInvite(groupId: string, userId: string): Promise<GroupInvite | undefined> {
      return db
        .selectFrom("friendGroupInvites")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Only the member count is exposed (no profile previews): a group doesn't
     * reveal its roster to someone it hasn't accepted yet.
     */
    async listOwnRequestsForUser(
      userId: string,
    ): Promise<(GroupInvite & { groupName: string; groupSlug: string; memberCount: number })[]> {
      const rows = await db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("friendGroups as g", "g.id", "i.groupId")
        .selectAll("i")
        .select(["g.name as groupName", "g.slug as groupSlug"])
        .select((eb) =>
          eb
            .selectFrom("friendGroupMembers as mc")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("mc.groupId", "=", "g.id")
            .as("memberCount"),
        )
        .where("i.userId", "=", userId)
        .where("i.direction", "=", "request")
        .orderBy("i.createdAt", "asc")
        .execute();

      return rows.map((row) => ({
        ...row,
        memberCount: Number(row.memberCount ?? 0),
      }));
    },

    listRequestsForGroup(groupId: string): Promise<
      (GroupInvite & {
        userName: string | null;
        userEmail: string;
        userImage: string | null;
      })[]
    > {
      return db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("users as u", "u.id", "i.userId")
        .selectAll("i")
        .select(["u.name as userName", "u.email as userEmail", "u.image as userImage"])
        .where("i.groupId", "=", groupId)
        .where("i.direction", "=", "request")
        .orderBy("i.createdAt", "asc")
        .execute();
    },

    async pendingRequestsCountForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("friendGroupInvites as i")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("i.direction", "=", "request")
        .where("i.groupId", "in", (eb) =>
          eb
            .selectFrom("friendGroupMembers as m")
            .select("m.groupId")
            .where("m.userId", "=", userId)
            .where("m.role", "in", ["owner", "admin"]),
        )
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /**
     * UNIQUE(group_id, user_id) means at most one row per (group, user);
     * ON CONFLICT DO NOTHING swallows duplicate clicks without erroring.
     *
     * The return value distinguishes the two: a repeated click leaves the row
     * untouched and must not re-notify the group's admins.
     * @returns Whether a new invite row was written.
     */
    async createInvite(
      groupId: string,
      userId: string,
      direction: FriendGroupInviteDirection,
    ): Promise<boolean> {
      const result = await db
        .insertInto("friendGroupInvites")
        .values({ groupId, userId, direction })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .executeTakeFirst();
      return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
    },

    async deleteInvite(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupInvites")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },
  };
}
