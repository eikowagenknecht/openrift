import { placementsFromGamePoints } from "@openrift/shared/pairing/points";
import { arrangeSeating, foldSeatingHistory } from "@openrift/shared/pairing/seating";
import { assignTableNumbers } from "@openrift/shared/pairing/table-assignment";
import type { PairingResult } from "@openrift/shared/pairing/types";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PodRoundRows } from "../lib/pod-tournament-presenters.js";
import type { Pod, PodRound } from "./pod-tournaments-shared.js";
import type { Tournament } from "./tournaments.js";

export interface PodForResult {
  pod: Pod;
  round: PodRound;
  tournament: Tournament;
  memberPlayerIds: string[];
  /** Player id -> team id, only for members that have one (2v2 play). */
  teamByPlayer: Map<string, string>;
}

/**
 * Rounds, pods, pod members and byes: the pairing the engine wrote, and the
 * results reported back into it.
 */
export function podRoundsRepo(db: Kysely<Database>) {
  // Pod numbers are the physical tables: pods holding a fixed-seat player claim
  // that table, everyone else fills the free numbers in engine order. Members
  // are written in seat order, arranged so nobody repeats earlier rounds'
  // neighbors more than the field forces.
  async function writePodsAndByes(
    trx: Kysely<Database>,
    roundId: string,
    pairing: PairingResult,
    byePlayerIds: string[],
  ): Promise<void> {
    const { tournamentId } = await trx
      .selectFrom("podRounds")
      .select("tournamentId")
      .where("id", "=", roundId)
      .executeTakeFirstOrThrow();
    const { playMode } = await trx
      .selectFrom("tournaments")
      .select("playMode")
      .where("id", "=", tournamentId)
      .executeTakeFirstOrThrow();
    const [fixedRows, seatRows] = await Promise.all([
      trx
        .selectFrom("tournamentParticipants")
        .select(["id", "fixedTable"])
        .where("tournamentId", "=", tournamentId)
        .where("fixedTable", "is not", null)
        .execute(),
      trx
        .selectFrom("podRounds as r")
        .innerJoin("pods as p", "p.roundId", "r.id")
        .innerJoin("podMembers as m", "m.podId", "p.id")
        .select(["m.podId as podId", "m.playerId as playerId", "m.seat as seat"])
        .where("r.tournamentId", "=", tournamentId)
        .where("r.status", "=", "finalized")
        .execute(),
    ]);
    const fixedTables = new Map(
      fixedRows.flatMap((row) =>
        row.fixedTable === null ? [] : [[row.id, row.fixedTable] as const],
      ),
    );
    const tableNumbers = assignTableNumbers(pairing.pods, fixedTables);
    const seatingHistory = foldSeatingHistory(seatRows);
    for (const [index, pod] of pairing.pods.entries()) {
      const breakdown = pairing.perPod[index];
      const podNumber = tableNumbers[index];
      if (breakdown === undefined || podNumber === undefined) {
        throw new Error(
          `pairing result is missing a penalty breakdown or table number for pod ${index}`,
        );
      }
      const podRow = await trx
        .insertInto("pods")
        .values({
          roundId,
          podNumber,
          size: pod.size,
          penaltyBreakdown: breakdown,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      // 2v2 keeps the expanded team order (each side's members adjacent) —
      // neighbor-variety seating is an FFA concern and would interleave teams.
      const seated =
        playMode === "2v2" ? pod.playerIds : arrangeSeating(pod.playerIds, seatingHistory);
      await trx
        .insertInto("podMembers")
        .values(
          seated.map((playerId, seat) => ({ podId: podRow.id, playerId, placement: null, seat })),
        )
        .execute();
    }
    if (byePlayerIds.length > 0) {
      await trx
        .insertInto("podByes")
        .values(byePlayerIds.map((playerId) => ({ roundId, playerId })))
        .execute();
    }
  }

  return {
    findOpenRound(tournamentId: string): Promise<PodRound | undefined> {
      return db
        .selectFrom("podRounds")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .where("status", "=", "reporting")
        .executeTakeFirst();
    },

    findRoundByNumber(tournamentId: string, roundNumber: number): Promise<PodRound | undefined> {
      return db
        .selectFrom("podRounds")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .where("roundNumber", "=", roundNumber)
        .executeTakeFirst();
    },

    createRound(
      tournamentId: string,
      roundNumber: number,
      pairing: PairingResult,
      byePlayerIds: string[] = [],
    ): Promise<PodRound> {
      return db.transaction().execute(async (trx) => {
        const round = await trx
          .insertInto("podRounds")
          .values({
            tournamentId,
            roundNumber,
            status: "reporting",
            penaltyTotal: pairing.totalPenalty,
            pairingStrategy: pairing.strategy,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await writePodsAndByes(trx, round.id, pairing, byePlayerIds);
        return round;
      });
    },

    async replacePairing(
      roundId: string,
      pairing: PairingResult,
      byePlayerIds: string[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("pods").where("roundId", "=", roundId).execute();
        await trx.deleteFrom("podByes").where("roundId", "=", roundId).execute();
        await writePodsAndByes(trx, roundId, pairing, byePlayerIds);
        await trx
          .updateTable("podRounds")
          .set({ penaltyTotal: pairing.totalPenalty, pairingStrategy: "manual" })
          .where("id", "=", roundId)
          .execute();
      });
    },

    async listRoundByePlayerIds(roundId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("podByes")
        .select("playerId")
        .where("roundId", "=", roundId)
        .execute();
      return rows.map((row) => row.playerId);
    },

    async listRoundMemberPlayerIds(roundId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("podMembers as m")
        .innerJoin("pods as p", "p.id", "m.podId")
        .select("m.playerId as playerId")
        .where("p.roundId", "=", roundId)
        .execute();
      return rows.map((row) => row.playerId);
    },

    async deleteRound(roundId: string): Promise<void> {
      await db.deleteFrom("podRounds").where("id", "=", roundId).execute();
    },

    async findPodForResult(podId: string): Promise<PodForResult | undefined> {
      const pod = await db
        .selectFrom("pods")
        .selectAll()
        .where("id", "=", podId)
        .executeTakeFirst();
      if (!pod) {
        return undefined;
      }
      const round = await db
        .selectFrom("podRounds")
        .selectAll()
        .where("id", "=", pod.roundId)
        .executeTakeFirst();
      if (!round) {
        return undefined;
      }
      const tournamentRow = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", round.tournamentId)
        .executeTakeFirst();
      if (!tournamentRow) {
        return undefined;
      }
      const memberRows = await db
        .selectFrom("podMembers as m")
        .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
        .select(["m.playerId as playerId", "pl.teamId as teamId"])
        .where("m.podId", "=", podId)
        .execute();
      return {
        pod,
        round,
        tournament: tournamentRow,
        memberPlayerIds: memberRows.map((row) => row.playerId),
        teamByPlayer: new Map(
          memberRows.flatMap((row) =>
            row.teamId === null ? [] : [[row.playerId, row.teamId] as const],
          ),
        ),
      };
    },

    async setPodResult(
      podId: string,
      results: { playerId: string; placement: number; gamePoints: number }[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        for (const { playerId, placement, gamePoints } of results) {
          await trx
            .updateTable("podMembers")
            .set({ placement, gamePoints })
            .where("podId", "=", podId)
            .where("playerId", "=", playerId)
            .execute();
        }
        await trx
          .updateTable("pods")
          .set({ resultStatus: "reported" })
          .where("id", "=", podId)
          .execute();
      });
    },

    /**
     * Per-player self-reporting; 2v2 passes both members of the reporter's
     * team, since a team shares one game score. The pod row is locked for the
     * transaction so two players submitting at the same time serialize and the
     * second one sees the first one's points.
     */
    async setMemberGamePoints(
      podId: string,
      playerIds: string[],
      gamePoints: number,
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.selectFrom("pods").select("id").where("id", "=", podId).forUpdate().execute();
        await trx
          .updateTable("podMembers")
          .set({ gamePoints })
          .where("podId", "=", podId)
          .where("playerId", "in", playerIds)
          .execute();
        const members = await trx
          .selectFrom("podMembers")
          .select(["playerId", "gamePoints"])
          .where("podId", "=", podId)
          .execute();
        const points = members.map((member) => member.gamePoints);
        if (members.length === 0 || points.some((value) => value === null)) {
          return;
        }
        const placements = placementsFromGamePoints(points as number[]);
        for (const [index, member] of members.entries()) {
          await trx
            .updateTable("podMembers")
            .set({ placement: placements[index] ?? 1 })
            .where("podId", "=", podId)
            .where("playerId", "=", member.playerId)
            .execute();
        }
        await trx
          .updateTable("pods")
          .set({ resultStatus: "reported" })
          .where("id", "=", podId)
          .execute();
      });
    },

    async allPodsReported(roundId: string): Promise<boolean> {
      const pending = await db
        .selectFrom("pods")
        .select("id")
        .where("roundId", "=", roundId)
        .where("resultStatus", "=", "pending")
        .executeTakeFirst();
      return pending === undefined;
    },

    async anyResultEntered(roundId: string): Promise<boolean> {
      const reported = await db
        .selectFrom("pods")
        .select("id")
        .where("roundId", "=", roundId)
        .where("resultStatus", "=", "reported")
        .executeTakeFirst();
      return reported !== undefined;
    },

    async finalizeRound(
      roundId: string,
      tournamentId: string,
      newCurrentRound: number,
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("podRounds")
          .set({ status: "finalized", finalizedAt: new Date() })
          .where("id", "=", roundId)
          .execute();
        await trx
          .updateTable("tournaments")
          .set({ currentRound: newCurrentRound })
          .where("id", "=", tournamentId)
          .execute();
      });
    },

    /** Rounds with their pods, members and byes; `toRoundResponse` scores them. */
    async loadRounds(tournamentId: string): Promise<PodRoundRows[]> {
      const rounds = await db
        .selectFrom("podRounds")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("roundNumber", "asc")
        .execute();
      if (rounds.length === 0) {
        return [];
      }
      const roundIds = rounds.map((round) => round.id);
      const pods = await db
        .selectFrom("pods")
        .selectAll()
        .where("roundId", "in", roundIds)
        .orderBy("podNumber", "asc")
        .execute();
      const podIds = pods.map((pod) => pod.id);
      const [memberRows, byeRows] = await Promise.all([
        podIds.length === 0
          ? Promise.resolve([])
          : db
              .selectFrom("podMembers as m")
              .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
              .select([
                "m.podId",
                "m.playerId",
                "pl.displayName",
                "pl.teamId",
                "m.placement",
                "m.gamePoints",
              ])
              .where("m.podId", "in", podIds)
              // Seat order IS the display order (NULLs last covers pre-seat rounds).
              .orderBy("m.seat", "asc")
              .execute(),
        db
          .selectFrom("podByes as b")
          .innerJoin("tournamentParticipants as pl", "pl.id", "b.playerId")
          .select(["b.roundId", "b.playerId", "pl.displayName"])
          .where("b.roundId", "in", roundIds)
          .execute(),
      ]);
      const membersByPod = Map.groupBy(memberRows, (row) => row.podId);
      const byesByRound = Map.groupBy(byeRows, (row) => row.roundId);
      const podsByRound = Map.groupBy(pods, (pod) => pod.roundId);
      return rounds.map((round) => ({
        round,
        pods: (podsByRound.get(round.id) ?? []).map((pod) => ({
          pod,
          members: membersByPod.get(pod.id) ?? [],
        })),
        byes: byesByRound.get(round.id) ?? [],
      }));
    },
  };
}
