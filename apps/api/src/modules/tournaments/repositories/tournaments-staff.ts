import type { TournamentStaffRole } from "@openrift/shared/types/api/tournament";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { Tournament } from "./tournaments-shared.js";

export interface TournamentStaffWithName {
  userId: string;
  name: string | null;
  role: TournamentStaffRole;
  addedAt: Date;
}

export function tournamentStaffRepo(db: Kysely<Database>) {
  return {
    async getStaffRoles(tournamentId: string, userId: string): Promise<TournamentStaffRole[]> {
      const rows = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .execute();
      return rows.map((row) => row.role);
    },

    async addStaff(tournamentId: string, userId: string, role: TournamentStaffRole): Promise<void> {
      await db
        .insertInto("tournamentStaff")
        .values({ tournamentId, userId, role })
        .onConflict((oc) => oc.columns(["tournamentId", "userId", "role"]).doNothing())
        .execute();
    },

    async removeStaff(
      tournamentId: string,
      userId: string,
      role: TournamentStaffRole,
    ): Promise<void> {
      await db
        .deleteFrom("tournamentStaff")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .where("role", "=", role)
        .execute();
    },

    async listStaffCandidates(
      tournamentId: string,
      groupId: string | null,
    ): Promise<{ userId: string; name: string | null; source: "group" | "participant" }[]> {
      const groupMembers = groupId
        ? await db
            .selectFrom("friendGroupMembers as m")
            .innerJoin("users as u", "u.id", "m.userId")
            .select(["m.userId as userId", "u.name as name"])
            .where("m.groupId", "=", groupId)
            .execute()
        : [];
      const participants = await db
        .selectFrom("tournamentParticipants as p")
        .innerJoin("users as u", "u.id", "p.userId")
        .select(["p.userId as userId", "u.name as name"])
        .where("p.tournamentId", "=", tournamentId)
        .where("p.userId", "is not", null)
        .execute();
      const existingStaff = await db
        .selectFrom("tournamentStaff")
        .select("userId")
        .where("tournamentId", "=", tournamentId)
        .execute();
      const taken = new Set(existingStaff.map((row) => row.userId));
      const byUser = new Map<
        string,
        { userId: string; name: string | null; source: "group" | "participant" }
      >();
      for (const member of groupMembers) {
        if (member.userId && !taken.has(member.userId)) {
          byUser.set(member.userId, { userId: member.userId, name: member.name, source: "group" });
        }
      }
      for (const participant of participants) {
        if (
          participant.userId &&
          !taken.has(participant.userId) &&
          !byUser.has(participant.userId)
        ) {
          byUser.set(participant.userId, {
            userId: participant.userId,
            name: participant.name,
            source: "participant",
          });
        }
      }
      return [...byUser.values()].sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿"));
    },

    /**
     * The server-side gate behind {@link listStaffCandidates}, so a forged
     * user id can't grant staff to an unrelated account.
     */
    async isStaffCandidate(
      tournamentId: string,
      groupId: string | null,
      userId: string,
    ): Promise<boolean> {
      if (groupId) {
        const member = await db
          .selectFrom("friendGroupMembers")
          .select("userId")
          .where("groupId", "=", groupId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (member) {
          return true;
        }
      }
      const participant = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return participant !== undefined;
    },

    async isHostOrStaff(
      tournamentId: string,
      userId: string,
      roles: TournamentStaffRole[] = ["organizer", "judge"],
    ): Promise<boolean> {
      const tournament = await db
        .selectFrom("tournaments")
        .select(["hostType", "hostUserId", "hostOrgId"])
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
          .select("role")
          .where("orgId", "=", tournament.hostOrgId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (orgMember) {
          const effectiveRole: TournamentStaffRole =
            orgMember.role === "judge" ? "judge" : "organizer";
          if (roles.includes(effectiveRole)) {
            return true;
          }
          // Otherwise fall through: an explicit grant may still match.
        }
      }
      const staff = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .where("role", "in", roles)
        .executeTakeFirst();
      return staff !== undefined;
    },

    async setStaffInviteToken(
      id: string,
      role: TournamentStaffRole,
      token: string | null,
    ): Promise<Tournament | undefined> {
      const column = role === "organizer" ? "organizerInviteToken" : "judgeInviteToken";
      const row = await db
        .updateTable("tournaments")
        .set({ [column]: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    async findByStaffInviteToken(
      token: string,
    ): Promise<{ tournament: Tournament; role: TournamentStaffRole } | undefined> {
      const tournament = await db
        .selectFrom("tournaments")
        .selectAll()
        .where((eb) =>
          eb.or([eb("organizerInviteToken", "=", token), eb("judgeInviteToken", "=", token)]),
        )
        .executeTakeFirst();
      if (!tournament) {
        return undefined;
      }
      const role: TournamentStaffRole =
        tournament.organizerInviteToken === token ? "organizer" : "judge";
      return { tournament, role };
    },

    staffRolesAcross(
      tournamentIds: string[],
      userId: string,
    ): Promise<{ tournamentId: string; role: TournamentStaffRole }[]> {
      if (tournamentIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("tournamentStaff")
        .select(["tournamentId", "role"])
        .where("tournamentId", "in", tournamentIds)
        .where("userId", "=", userId)
        .execute();
    },

    listStaffWithNames(tournamentId: string): Promise<TournamentStaffWithName[]> {
      return db
        .selectFrom("tournamentStaff as s")
        .leftJoin("users as u", "u.id", "s.userId")
        .select(["s.userId", "u.name as name", "s.role", "s.addedAt"])
        .where("s.tournamentId", "=", tournamentId)
        .orderBy("s.addedAt", "asc")
        .execute();
    },
  };
}
