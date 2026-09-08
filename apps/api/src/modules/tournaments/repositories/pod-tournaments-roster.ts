import type { PodPlayerStatus } from "@openrift/shared/types/api/pod-tournament";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PodPlayer, PodRosterPlayer } from "./pod-tournaments-shared.js";
import { ROSTER_STATUSES } from "./pod-tournaments-shared.js";

// Kysely commits a transaction unless the callback throws; this lets a race
// roll the transaction back without surfacing a transport-level AppError.
class TeamRaceLostError extends Error {
  override name = "TeamRaceLostError";
}

/**
 * The roster side of `tournament_participants`: the players themselves and the
 * fixed teams they are grouped into for 2v2 play.
 */
export function podRosterRepo(db: Kysely<Database>) {
  return {
    listPlayers(tournamentId: string): Promise<PodRosterPlayer[]> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .where("status", "in", ROSTER_STATUSES)
        .$narrowType<{ status: PodPlayerStatus }>()
        .orderBy("createdAt", "asc")
        .execute();
    },

    findPlayer(playerId: string): Promise<PodPlayer | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("id", "=", playerId)
        .executeTakeFirst();
    },

    addPlayer(tournamentId: string, displayName: string): Promise<PodPlayer> {
      return db
        .insertInto("tournamentParticipants")
        .values({ tournamentId, displayName })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    renamePlayer(playerId: string, displayName: string): Promise<PodPlayer | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({ displayName })
        .where("id", "=", playerId)
        .returningAll()
        .executeTakeFirst();
    },

    dropPlayer(playerId: string, droppedAfterRound: number): Promise<PodPlayer | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({ status: "dropped", droppedAfterRound })
        .where("id", "=", playerId)
        .returningAll()
        .executeTakeFirst();
    },

    /** Undo a drop: the player is active again and paired from the next round; results are retained. */
    reactivatePlayer(playerId: string): Promise<PodPlayer | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({ status: "active", droppedAfterRound: null })
        .where("id", "=", playerId)
        .returningAll()
        .executeTakeFirst();
    },

    async deletePlayer(playerId: string): Promise<void> {
      await db.deleteFrom("tournamentParticipants").where("id", "=", playerId).execute();
    },

    async playerHasMemberships(playerId: string): Promise<boolean> {
      const row = await db
        .selectFrom("podMembers")
        .select("podId")
        .where("playerId", "=", playerId)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Create a team from two participants, atomically. Eligibility (2v2
     * tournament, both active and unteamed) is the service's job.
     * @returns The new team id, or null when a participant was taken meanwhile.
     */
    async createTeam(
      tournamentId: string,
      participantIds: [string, string],
    ): Promise<string | null> {
      try {
        return await db.transaction().execute(async (trx) => {
          const team = await trx
            .insertInto("tournamentTeams")
            .values({ tournamentId })
            .returning("id")
            .executeTakeFirstOrThrow();
          // The teamId IS NULL guard makes concurrent creates sharing a
          // participant safe: the loser updates fewer than two rows, throws, and
          // its team row rolls back with the transaction — no half-team remains.
          // Scoping to the tournament also backstops a cross-tournament id mixup
          // (the composite team FK rejects those outright).
          const updated = await trx
            .updateTable("tournamentParticipants")
            .set({ teamId: team.id })
            .where("id", "in", participantIds)
            .where("tournamentId", "=", tournamentId)
            .where("teamId", "is", null)
            .executeTakeFirst();
          if (updated.numUpdatedRows !== 2n) {
            throw new TeamRaceLostError();
          }
          return team.id;
        });
      } catch (error) {
        if (error instanceof TeamRaceLostError) {
          return null;
        }
        throw error;
      }
    },

    findTeam(teamId: string): Promise<{ id: string; tournamentId: string } | undefined> {
      return db
        .selectFrom("tournamentTeams")
        .select(["id", "tournamentId"])
        .where("id", "=", teamId)
        .executeTakeFirst();
    },

    /** Deletes the team; the members' `teamId` clears via ON DELETE SET NULL. */
    async dissolveTeam(teamId: string): Promise<void> {
      await db.deleteFrom("tournamentTeams").where("id", "=", teamId).execute();
    },

    async dissolveAllTeams(tournamentId: string): Promise<void> {
      await db.deleteFrom("tournamentTeams").where("tournamentId", "=", tournamentId).execute();
    },

    async teamHasMemberships(teamId: string): Promise<boolean> {
      const row = await db
        .selectFrom("podMembers as m")
        .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
        .select("m.podId")
        .where("pl.teamId", "=", teamId)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}
