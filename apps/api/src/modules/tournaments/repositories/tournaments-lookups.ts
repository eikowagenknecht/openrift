import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export function tournamentLookupsRepo(db: Kysely<Database>) {
  return {
    async getGroupOwnerUserId(groupId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("friendGroupMembers")
        .select("userId")
        .where("groupId", "=", groupId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      return row?.userId;
    },

    async getGroupInfo(groupIds: string[]): Promise<Map<string, { slug: string; name: string }>> {
      const unique = [...new Set(groupIds)];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("friendGroups")
        .select(["id", "slug", "name"])
        .where("id", "in", unique)
        .execute();
      return new Map(rows.map((row) => [row.id, { slug: row.slug, name: row.name }]));
    },

    async getUserNames(userIds: string[]): Promise<Map<string, string | null>> {
      const unique = [...new Set(userIds)];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("users")
        .select(["id", "name"])
        .where("id", "in", unique)
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    /**
     * Any relationship (host, staff, participant, or linked-group member) —
     * the in-app visibility gate for the detail read.
     */
    async hasRelationship(tournamentId: string, userId: string): Promise<boolean> {
      const tournament = await db
        .selectFrom("tournaments")
        .select(["hostType", "hostUserId", "hostOrgId", "groupId"])
        .where("id", "=", tournamentId)
        .executeTakeFirst();
      if (!tournament) {
        return false;
      }
      if (tournament.hostType === "user" && tournament.hostUserId === userId) {
        return true;
      }
      if (tournament.hostType === "organization" && tournament.hostOrgId) {
        const orgMember = await db
          .selectFrom("organizationMembers")
          .select("userId")
          .where("orgId", "=", tournament.hostOrgId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (orgMember) {
          return true;
        }
      }
      if (tournament.groupId) {
        const groupMember = await db
          .selectFrom("friendGroupMembers")
          .select("userId")
          .where("groupId", "=", tournament.groupId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (groupMember) {
          return true;
        }
      }
      const staff = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      if (staff) {
        return true;
      }
      const participant = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return participant !== undefined;
    },
  };
}
