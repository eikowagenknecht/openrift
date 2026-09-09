import type { CutSize } from "@openrift/shared/pairing/group-cut-types";
import type { PodScoringScheme } from "@openrift/shared/types/api/pod-tournament";
import type {
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentFormat,
  TournamentHostType,
  TournamentListLockMode,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentPlayMode,
  TournamentStatus,
} from "@openrift/shared/types/api/tournament";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { Tournament } from "./tournaments-shared.js";

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
  format?: TournamentFormat;
  cutSize?: CutSize;
  cutRematchAvoidance?: boolean;
  legendTiebreak?: boolean;
  groupsSelfPaced?: boolean;
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
  format?: TournamentFormat;
  cutSize?: CutSize;
  cutRematchAvoidance?: boolean;
  legendTiebreak?: boolean;
  groupsSelfPaced?: boolean;
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

export function tournamentsCoreRepo(db: Kysely<Database>) {
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
  };
}
