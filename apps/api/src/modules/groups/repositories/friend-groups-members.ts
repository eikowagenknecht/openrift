import type { ContactMethod } from "@openrift/shared/types/api/contact-method";
import type { FriendGroupRole } from "@openrift/shared/types/api/friend-group";
import { sql } from "kysely";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { GroupMember, MemberWithUser } from "./friend-groups-shared.js";

export function friendGroupMembersRepo(db: Kysely<Database>) {
  return {
    getMembership(groupId: string, userId: string): Promise<GroupMember | undefined> {
      return db
        .selectFrom("friendGroupMembers")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    listMembers(groupId: string): Promise<MemberWithUser[]> {
      return (
        db
          .selectFrom("friendGroupMembers as m")
          .innerJoin("users as u", "u.id", "m.userId")
          .selectAll("m")
          .select(["u.name as userName", "u.email as userEmail", "u.image as userImage"])
          .where("m.groupId", "=", groupId)
          // oxlint-disable promise/prefer-await-to-then -- Kysely's case().when().then() is not a Promise chain
          .orderBy(
            (eb) => eb.case("m.role").when("owner").then(0).when("admin").then(1).else(2).end(),
            "asc",
          )
          // oxlint-enable promise/prefer-await-to-then
          .orderBy(sql`lower(u.name)`, "asc")
          .orderBy("m.joinedAt", "asc")
          .execute()
      );
    },

    async addMember(groupId: string, userId: string, role: FriendGroupRole): Promise<void> {
      await db
        .insertInto("friendGroupMembers")
        .values({ groupId, userId, role })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .execute();
    },

    /** The FK cascade removes the member's shares for that group. */
    async removeMember(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupMembers")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Not for owner changes — use `transferOwnership` (the partial unique
     * index would reject two owners anyway).
     */
    updateRole(
      groupId: string,
      userId: string,
      role: FriendGroupRole,
    ): Promise<GroupMember | undefined> {
      return db
        .updateTable("friendGroupMembers")
        .set({ role })
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    async getRevealedContactsForMembers(groupId: string): Promise<Map<string, ContactMethod[]>> {
      const rows = await db
        .selectFrom("friendGroupMemberContacts as fgmc")
        .innerJoin("userContactMethods as ucm", "ucm.id", "fgmc.contactMethodId")
        .select(["fgmc.userId as userId", "ucm.id as id", "ucm.type as type", "ucm.value as value"])
        .where("fgmc.groupId", "=", groupId)
        .orderBy("ucm.sortOrder", "asc")
        .orderBy("ucm.id", "asc")
        .execute();

      const byUser = new Map<string, ContactMethod[]>();
      for (const row of rows) {
        const list = byUser.get(row.userId) ?? [];
        list.push({ id: row.id, type: row.type, value: row.value });
        byUser.set(row.userId, list);
      }
      return byUser;
    },

    /**
     * Only ids the member actually owns are accepted (others are silently
     * dropped), so a caller can't reveal someone else's method.
     */
    async setRevealedContacts(
      groupId: string,
      userId: string,
      contactMethodIds: string[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("friendGroupMemberContacts")
          .where("groupId", "=", groupId)
          .where("userId", "=", userId)
          .execute();

        if (contactMethodIds.length === 0) {
          return;
        }

        const owned = await trx
          .selectFrom("userContactMethods")
          .select("id")
          .where("userId", "=", userId)
          .where("id", "in", contactMethodIds)
          .execute();
        if (owned.length === 0) {
          return;
        }

        await trx
          .insertInto("friendGroupMemberContacts")
          .values(owned.map((row) => ({ groupId, userId, contactMethodId: row.id })))
          .execute();
      });
    },

    /**
     * Atomic ownership transfer. Demotes the outgoing owner to `admin` and
     * promotes the target to `owner`, in one transaction. The partial unique
     * index (`uq_friend_group_one_owner`) would otherwise reject a naive
     * "promote then demote" because it'd briefly see two owners; we order
     * demote → promote and rely on the transaction.
     *
     * The promote must match a row: a `toUserId` who is not a member updates
     * nothing, and the demote alone would leave the group ownerless. The route
     * checks membership first, so reaching the throw means the target left the
     * group in between — the transaction rolls back and the owner keeps the
     * group.
     */
    async transferOwnership(groupId: string, fromUserId: string, toUserId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("friendGroupMembers")
          .set({ role: "admin" })
          .where("groupId", "=", groupId)
          .where("userId", "=", fromUserId)
          .where("role", "=", "owner")
          .execute();

        await trx
          .updateTable("friendGroupMembers")
          .set({ role: "owner" })
          .where("groupId", "=", groupId)
          .where("userId", "=", toUserId)
          .returning("userId")
          .executeTakeFirstOrThrow(
            () =>
              new Error(
                `Cannot transfer ownership of group ${groupId}: user ${toUserId} is not a member`,
              ),
          );
      });
    },
  };
}
