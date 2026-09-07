import type { PodScoringScheme } from "@openrift/shared/types/api/pod-tournament";
import type {
  TournamentClaimSource,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentHostType,
  TournamentListLockMode,
  TournamentParticipantStatus,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentPlayMode,
  TournamentStaffRole,
  TournamentStatus,
} from "@openrift/shared/types/api/tournament";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  TournamentParticipantsTable,
  TournamentsTable,
} from "../../../db/tables/tournaments.js";
import { generateShareToken } from "../../../lib/share-token.js";

export type Tournament = Selectable<TournamentsTable>;
export type TournamentParticipant = Selectable<TournamentParticipantsTable>;

export interface NewTournament {
  hostType: TournamentHostType;
  hostUserId?: string | null;
  hostOrgId?: string | null;
  groupId?: string | null;
  name: string;
  status?: TournamentStatus;
  /** Omit to fall back to the DB default of now(); the wizard always sets it. */
  startsAt?: Date;
  /** Optional end instant: a multi-day close, or null for a single-day event. */
  endsAt?: Date | null;
  pairingStyle: TournamentPairingStyle;
  /** 1v1 or 2v2 team play; omit for the DB default of 1v1. */
  playMode?: TournamentPlayMode;
  scoringScheme?: PodScoringScheme;
  byePoints?: number;
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  regionsEnabled?: boolean;
  deckSubmission: TournamentDeckSubmission;
  deckPhase?: TournamentDeckPhase;
  submissionsCloseAt?: Date | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  selfRegistration?: boolean;
}

/** Editable umbrella settings (re-validated against the CHECK invariants by the route). */
export interface TournamentPatch {
  name?: string;
  status?: TournamentStatus;
  /** Host reassignment. Set all three together to keep the host CHECK satisfied. */
  hostType?: TournamentHostType;
  hostUserId?: string | null;
  hostOrgId?: string | null;
  /** The pairing engine. The route guards that it only changes before any round. */
  pairingStyle?: TournamentPairingStyle;
  /** The play mode. The route guards that it only changes before any round. */
  playMode?: TournamentPlayMode;
  startsAt?: Date;
  endsAt?: Date | null;
  groupId?: string | null;
  scoringScheme?: PodScoringScheme;
  byePoints?: number;
  /** The Swiss result-entry format. The route guards that it only changes before any round. */
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  regionsEnabled?: boolean;
  deckSubmission?: TournamentDeckSubmission;
  deckPhase?: TournamentDeckPhase;
  submissionsCloseAt?: Date | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  selfRegistration?: boolean;
}

export interface TournamentSummaryRow extends Tournament {
  participantCount: number;
  pendingRequestCount: number;
}

export interface TournamentStaffWithName {
  userId: string;
  name: string | null;
  role: TournamentStaffRole;
  addedAt: Date;
}

export interface TournamentParticipantWithUser extends TournamentParticipant {
  /** Linked account's display name; null for walk-ins. */
  userName: string | null;
}

export interface NewTournamentParticipant {
  tournamentId: string;
  displayName: string;
  /** Region tag slug (custom-tag category `region`); validated by the route. */
  region?: string | null;
  /** Fixed (physical) table number; soft, steers table assignment only. */
  fixedTable?: number | null;
  riotId?: string | null;
  userId?: string | null;
  claimSource?: TournamentClaimSource | null;
  claimToken?: string | null;
  claimedAt?: Date | null;
  status?: TournamentParticipantStatus;
}

export interface TournamentParticipantPatch {
  displayName?: string;
  region?: string | null;
  fixedTable?: number | null;
  riotId?: string | null;
  userId?: string | null;
  claimSource?: TournamentClaimSource | null;
  claimToken?: string | null;
  claimedAt?: Date | null;
  claimBlockedAt?: Date | null;
  status?: TournamentParticipantStatus;
  seed?: number | null;
  droppedAfterRound?: number | null;
}

/**
 * Authorization composes host authority (the hosting user, or an
 * organization's owner/manager) with per-tournament `tournament_staff` grants.
 * The repo is naive about who is calling; the route composes the checks.
 */
export function tournamentsRepo(db: Kysely<Database>) {
  return {
    async findById(id: string): Promise<Tournament | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    async listForGroup(groupId: string): Promise<Tournament[]> {
      const rows = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("groupId", "=", groupId)
        .orderBy("startsAt", "desc")
        .orderBy("createdAt", "desc")
        .execute();
      return rows;
    },

    async listForGroupWithCounts(groupId: string): Promise<TournamentSummaryRow[]> {
      const rows = await db
        .selectFrom("tournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where("t.groupId", "=", groupId)
        .orderBy("t.startsAt", "desc")
        .orderBy("t.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...row,
        participantCount: Number(row.participantCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
      }));
    },

    /**
     * Mirrors `participantCount`'s population (every status), so the facepile
     * never disagrees with the count next to it.
     */
    participantPreviewAcross(
      tournamentIds: string[],
      limit: number,
    ): Promise<
      { tournamentId: string; displayName: string; image: string | null; email: string | null }[]
    > {
      if (tournamentIds.length === 0) {
        return Promise.resolve([]);
      }
      const ranked = db
        .selectFrom("tournamentParticipants as p")
        .leftJoin("users as u", "u.id", "p.userId")
        .select([
          "p.tournamentId",
          "p.displayName",
          "u.image",
          "u.email",
          sql<number>`(row_number() over (
            partition by p.tournament_id order by p.created_at, p.id
          ))::int`.as("previewRank"),
        ])
        .where("p.tournamentId", "in", tournamentIds);
      return db
        .selectFrom(ranked.as("ranked"))
        .select(["ranked.tournamentId", "ranked.displayName", "ranked.image", "ranked.email"])
        .where("ranked.previewRank", "<=", limit)
        .orderBy("ranked.tournamentId")
        .orderBy("ranked.previewRank")
        .execute();
    },

    async getGroupOwnerUserId(groupId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("friendGroupMembers")
        .select("userId")
        .where("groupId", "=", groupId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      return row?.userId;
    },

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

    listParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("createdAt", "asc")
        .execute();
    },

    findParticipantById(participantId: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("id", "=", participantId)
        .executeTakeFirst();
    },

    findParticipantByClaimToken(token: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("claimToken", "=", token)
        .executeTakeFirst();
    },

    async getClaimLandingByToken(token: string): Promise<
      | {
          tournamentId: string;
          tournamentName: string;
          startsAt: Date;
          hostName: string;
          hostType: "user" | "organization";
          groupName: string | null;
          deckSubmission: "none" | "optional" | "required";
          participantName: string;
        }
      | undefined
    > {
      const row = await db
        .selectFrom("tournamentParticipants as p")
        .innerJoin("tournaments as t", "t.id", "p.tournamentId")
        .leftJoin("friendGroups as g", "g.id", "t.groupId")
        .leftJoin("organizations as o", "o.id", "t.hostOrgId")
        .leftJoin("users as hu", "hu.id", "t.hostUserId")
        .select((eb) => [
          eb.ref("t.id").as("tournamentId"),
          eb.ref("t.name").as("tournamentName"),
          eb.ref("t.startsAt").as("startsAt"),
          eb.ref("t.hostType").as("hostType"),
          eb.ref("t.deckSubmission").as("deckSubmission"),
          eb.ref("o.name").as("orgName"),
          eb.ref("hu.name").as("hostUserName"),
          eb.ref("g.name").as("groupName"),
          eb.ref("p.displayName").as("participantName"),
        ])
        .where("p.claimToken", "=", token)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }
      const hostName =
        row.hostType === "organization"
          ? (row.orgName ?? "Organization")
          : (row.hostUserName ?? "User");
      return {
        tournamentId: row.tournamentId,
        tournamentName: row.tournamentName,
        startsAt: row.startsAt,
        hostName,
        hostType: row.hostType,
        groupName: row.groupName ?? null,
        deckSubmission: row.deckSubmission,
        participantName: row.participantName,
      };
    },

    /**
     * Links only while the spot is unclaimed and not judge-blocked. The guard
     * re-checks atomically, so a race resolves to no update (a refusal), never
     * a steal.
     */
    linkParticipantByClaimTokenIfUnclaimed(
      token: string,
      userId: string,
      source: TournamentClaimSource,
    ): Promise<TournamentParticipant | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({ userId, claimSource: source, claimedAt: new Date(), updatedAt: new Date() })
        .where("claimToken", "=", token)
        .where("userId", "is", null)
        .where("claimBlockedAt", "is", null)
        .returningAll()
        .executeTakeFirst();
    },

    findParticipantByUser(
      tournamentId: string,
      userId: string,
    ): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Matches by linked account only, never by name; without a userId a fresh walk-in is created.
     * Manual entry passes a participant id directly and never goes through here.
     */
    async resolveOrCreateParticipant(input: {
      tournamentId: string;
      userId?: string | null;
      riotId?: string | null;
      displayName: string;
      claimSource?: TournamentClaimSource | null;
      claimedAt?: Date | null;
      /** Status for a newly created participant only; ignored on a match by linked account. */
      status?: TournamentParticipantStatus;
    }): Promise<TournamentParticipant> {
      if (input.userId) {
        const byUser = await this.findParticipantByUser(input.tournamentId, input.userId);
        if (byUser) {
          return byUser;
        }
      }
      return this.createParticipant({
        tournamentId: input.tournamentId,
        displayName: input.displayName,
        riotId: input.riotId ?? null,
        userId: input.userId ?? null,
        claimSource: input.claimSource ?? null,
        claimedAt: input.claimedAt ?? null,
        claimToken: generateShareToken(),
        status: input.status ?? "active",
      });
    },

    /**
     * Every participant gets a claim token so the spot can be claimed by link,
     * with or without deck check.
     */
    createParticipant(input: NewTournamentParticipant): Promise<TournamentParticipant> {
      const { status, claimToken, ...rest } = input;
      return db
        .insertInto("tournamentParticipants")
        .values({
          ...rest,
          claimToken: claimToken ?? generateShareToken(),
          status,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    updateParticipant(
      participantId: string,
      patch: TournamentParticipantPatch,
    ): Promise<TournamentParticipant | undefined> {
      const { status, ...rest } = patch;
      return db
        .updateTable("tournamentParticipants")
        .set({
          ...rest,
          ...(status === undefined ? {} : { status }),
          updatedAt: new Date(),
        })
        .where("id", "=", participantId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Clears the claim block an unlink left behind and rotates the claim
     * token, so the correct player can claim the spot through a fresh link.
     */
    reissueClaim(participantId: string): Promise<TournamentParticipant | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({
          userId: null,
          claimSource: null,
          claimedAt: null,
          claimBlockedAt: null,
          claimToken: generateShareToken(),
          updatedAt: new Date(),
        })
        .where("id", "=", participantId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Locks the participant row (`SELECT … FOR UPDATE`). Call inside a
     * transaction before a check-then-mutate on the participant (deck-entry
     * creation, removal): a concurrent pairing holds `FOR KEY SHARE` on this
     * row through its pod_members FK inserts, so the lock serializes the two
     * and the re-check after it sees the committed truth.
     */
    async lockParticipant(participantId: string): Promise<boolean> {
      const row = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("id", "=", participantId)
        .forUpdate()
        .executeTakeFirst();
      return row !== undefined;
    },

    async deleteParticipant(participantId: string): Promise<void> {
      // The decklist is discarded too, via the deck_check_entries
      // participant_id ON DELETE CASCADE FK — no code path can leave an
      // orphaned entry. Claim/link/re-submit never delete a participant, so
      // the cascade only fires on an explicit removal.
      await db.deleteFrom("tournamentParticipants").where("id", "=", participantId).execute();
    },

    /**
     * A participant in a pod or holding a bye cannot be hard-deleted; the host
     * drops it instead, mirroring the pod player guard.
     */
    async participantHasMemberships(participantId: string): Promise<boolean> {
      const member = await db
        .selectFrom("podMembers")
        .select("podId")
        .where("playerId", "=", participantId)
        .executeTakeFirst();
      if (member !== undefined) {
        return true;
      }
      const bye = await db
        .selectFrom("podByes")
        .select("roundId")
        .where("playerId", "=", participantId)
        .executeTakeFirst();
      return bye !== undefined;
    },

    listParticipantsWithUser(tournamentId: string): Promise<TournamentParticipantWithUser[]> {
      return db
        .selectFrom("tournamentParticipants as p")
        .leftJoin("users as u", "u.id", "p.userId")
        .selectAll("p")
        .select((eb) => eb.ref("u.name").as("userName"))
        .where("p.tournamentId", "=", tournamentId)
        .orderBy("p.createdAt", "asc")
        .execute();
    },

    async create(values: NewTournament): Promise<Tournament> {
      const { status, allowedSets, ...rest } = values;
      const row = await db
        .insertInto("tournaments")
        .values({
          ...rest,
          ...(status === undefined ? {} : { status }),
          allowedSets,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    },

    async updateSettings(id: string, patch: TournamentPatch): Promise<Tournament | undefined> {
      const { status, allowedSets, ...rest } = patch;
      const row = await db
        .updateTable("tournaments")
        .set({
          ...rest,
          ...(status === undefined ? {} : { status }),
          ...(allowedSets === undefined ? {} : { allowedSets }),
          updatedAt: new Date(),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("tournaments").where("id", "=", id).execute();
    },

    async setSubmissionToken(id: string, token: string | null): Promise<Tournament | undefined> {
      const row = await db
        .updateTable("tournaments")
        .set({ submissionToken: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    async findBySubmissionToken(token: string): Promise<Tournament | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("submissionToken", "=", token)
        .executeTakeFirst();
      return row;
    },

    async setReportToken(id: string, token: string | null): Promise<Tournament | undefined> {
      const row = await db
        .updateTable("tournaments")
        .set({ reportToken: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    async setFollowToken(id: string, token: string | null): Promise<Tournament | undefined> {
      const row = await db
        .updateTable("tournaments")
        .set({ followToken: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    /**
     * The caller decides write permission by comparing the matched token
     * against `reportToken` (read+write) vs `followToken` (read-only).
     */
    async findByShareToken(token: string): Promise<Tournament | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where((eb) => eb.or([eb("reportToken", "=", token), eb("followToken", "=", token)]))
        .executeTakeFirst();
      return row;
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

    async getCounts(
      tournamentId: string,
    ): Promise<{ participantCount: number; pendingRequestCount: number }> {
      const row = await db
        .selectFrom("tournaments as t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where("t.id", "=", tournamentId)
        .executeTakeFirst();
      return {
        participantCount: Number(row?.participantCount ?? 0),
        pendingRequestCount: Number(row?.pendingRequestCount ?? 0),
      };
    },

    async hasRounds(tournamentId: string): Promise<boolean> {
      const row = await db
        .selectFrom("podRounds")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    async listForUser(userId: string, orgIds: string[]): Promise<TournamentSummaryRow[]> {
      const rows = await db
        .selectFrom("tournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where((eb) =>
          eb.or([
            eb.and([eb("t.hostType", "=", "user"), eb("t.hostUserId", "=", userId)]),
            orgIds.length > 0 ? eb("t.hostOrgId", "in", orgIds) : eb.val(false),
            eb.exists(
              eb
                .selectFrom("tournamentStaff as s")
                .select("s.userId")
                .whereRef("s.tournamentId", "=", "t.id")
                .where("s.userId", "=", userId),
            ),
            eb.exists(
              eb
                .selectFrom("tournamentParticipants as p")
                .select("p.id")
                .whereRef("p.tournamentId", "=", "t.id")
                .where("p.userId", "=", userId),
            ),
          ]),
        )
        .orderBy("t.startsAt", "desc")
        .orderBy("t.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...row,
        participantCount: Number(row.participantCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
      }));
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

    async participantTournamentIdsAcross(
      tournamentIds: string[],
      userId: string,
    ): Promise<string[]> {
      if (tournamentIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("tournamentParticipants")
        .select("tournamentId")
        .where("tournamentId", "in", tournamentIds)
        .where("userId", "=", userId)
        .execute();
      return rows.map((row) => row.tournamentId);
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
