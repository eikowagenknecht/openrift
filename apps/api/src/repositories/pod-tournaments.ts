import { placementsFromGamePoints } from "@openrift/shared/pairing/points";
import { arrangeSeating, foldSeatingHistory } from "@openrift/shared/pairing/seating";
import { assignTableNumbers } from "@openrift/shared/pairing/table-assignment";
import type { PairingPlayer, PairingResult } from "@openrift/shared/pairing/types";
import type {
  PodPlayerStatus,
  PodSnapshotPlayer,
  PodStandingRow,
} from "@openrift/shared/types/api/pod-tournament";
import type { Kysely, Selectable } from "kysely";

import type {
  Database,
  PodRoundsTable,
  PodsTable,
  TournamentParticipantsTable,
} from "../db/index.js";
import type { PodScoring } from "../lib/pod-scoring.js";
import type { PodRoundRows } from "../lib/pod-tournament-presenters.js";
import {
  podSizeOf,
  pointsForPod,
  pointsForTeamPod,
  teamsOf,
} from "../lib/pod-tournament-presenters.js";
import type { Tournament } from "./tournaments.js";

export type PodPlayer = Selectable<TournamentParticipantsTable>;
/**
 * A participant on the competing roster (active or dropped). The umbrella
 * lifecycle also has requested/invited/no_show participants, but those never
 * appear on the run surface (players, standings, winners) — the pod response
 * schemas reject them, and a leaked `requested` self-registration 500s
 * `runState` output validation. Queries narrow via ROSTER_STATUSES.
 */
export type PodRosterPlayer = PodPlayer & { status: PodPlayerStatus };

const ROSTER_STATUSES: readonly PodPlayerStatus[] = ["active", "dropped"];
export type PodRound = Selectable<PodRoundsTable>;
export type Pod = Selectable<PodsTable>;

export interface PodForResult {
  pod: Pod;
  round: PodRound;
  tournament: Tournament;
  memberPlayerIds: string[];
  /** Player id -> team id, only for members that have one (2v2 play). */
  teamByPlayer: Map<string, string>;
}

export type PairingSnapshotPlayer = PairingPlayer & { teamId: string | null };

/** Per-player aggregate, derived from the finalized rounds (the lean model's source of truth). */
interface PlayerAggregate {
  score: number;
  /** Sum of raw game points across finalized pods; first tie-breaker after score. */
  gamePoints: number;
  pods3: number;
  pods4: number;
  /** Byes taken: a bye sits a round out for the tournament's bye points. */
  byes: number;
  /** Pods won outright (sole 1st place; a tied 1st does not count). */
  podWins: number;
  /** Swiss match record, counted for 2-pods only; stays 0 for pod-style play. */
  wins: number;
  draws: number;
  losses: number;
  roundsPlayed: number;
  opponents: Map<string, number>;
}

interface FinalizedMemberRow {
  podId: string;
  size: number;
  playerId: string;
  /** The player's current fixed team (2v2 play); null in 1v1 play. */
  teamId: string | null;
  placement: number | null;
  gamePoints: number | null;
}

// A stable pseudo-random key per player id, used as the final standings
// tie-breaker so fully-tied players get an arbitrary but consistent order instead
// of reshuffling on every read. Math.imul keeps each step within a 32-bit int.
function tieBreakKey(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash, 31) + (id.codePointAt(index) ?? 0);
  }
  return hash;
}

/**
 * Times each region has been faced (region slug -> prior meetings), folding the
 * opponent meeting counts through the opponents' CURRENT regions. Derive-on-read
 * like everything else, so a region edit recounts the history on the next pairing.
 */
function regionHistoryFrom(
  opponents: Map<string, number> | undefined,
  regionById: Map<string, string | null>,
): Map<string, number> {
  const history = new Map<string, number>();
  if (!opponents) {
    return history;
  }
  for (const [opponentId, meetings] of opponents) {
    const region = regionById.get(opponentId) ?? null;
    if (region !== null) {
      history.set(region, (history.get(region) ?? 0) + meetings);
    }
  }
  return history;
}

function emptyAggregate(): PlayerAggregate {
  return {
    score: 0,
    gamePoints: 0,
    pods3: 0,
    pods4: 0,
    byes: 0,
    podWins: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    roundsPlayed: 0,
    opponents: new Map(),
  };
}

function foldFinalized(
  rows: FinalizedMemberRow[],
  byePlayerIds: string[],
  scoring: PodScoring,
): Map<string, PlayerAggregate> {
  const aggregates = new Map<string, PlayerAggregate>();
  const ensure = (id: string): PlayerAggregate => {
    const existing = aggregates.get(id);
    if (existing) {
      return existing;
    }
    const fresh = emptyAggregate();
    aggregates.set(id, fresh);
    return fresh;
  };

  for (const [, members] of Map.groupBy(rows, (row) => row.podId)) {
    const size = podSizeOf(members[0]?.size ?? 4);
    const teams = scoring.playMode === "2v2" ? teamsOf(members) : null;
    const points = teams
      ? pointsForTeamPod(members, teams, scoring)
      : pointsForPod(
          members.map((member) => member.placement ?? 0),
          size,
          scoring,
        );
    members.forEach((member, index) => {
      const aggregate = ensure(member.playerId);
      aggregate.score += points[index] ?? 0;
      aggregate.gamePoints += member.gamePoints ?? 0;
      aggregate.roundsPlayed += 1;
      // A team match is a Swiss match, not an FFA pod: the pod-fairness
      // tallies stay 0 for it.
      if (teams === null) {
        if (size === 3) {
          aggregate.pods3 += 1;
        } else if (size === 4) {
          aggregate.pods4 += 1;
        }
      }
    });
    // Pod win = sole 1st place: the unique lowest placement value in the pod.
    const placements = members
      .map((member) => member.placement)
      .filter((value): value is number => value !== null);
    if (placements.length === members.length && members.length > 0) {
      const best = Math.min(...placements);
      const leaders = members.filter((member) => member.placement === best);
      if (teams) {
        const leaderTeams = new Set(leaders.map((member) => member.teamId));
        for (const member of members) {
          const aggregate = ensure(member.playerId);
          if (leaderTeams.size === 2) {
            aggregate.draws += 1;
          } else if (leaderTeams.has(member.teamId)) {
            aggregate.wins += 1;
            aggregate.podWins += 1;
          } else {
            aggregate.losses += 1;
          }
        }
      } else {
        const soleLeader = leaders.length === 1 ? leaders[0] : undefined;
        if (soleLeader) {
          ensure(soleLeader.playerId).podWins += 1;
        }
        if (size === 2) {
          for (const member of members) {
            const aggregate = ensure(member.playerId);
            if (leaders.length === 1) {
              if (member.placement === best) {
                aggregate.wins += 1;
              } else {
                aggregate.losses += 1;
              }
            } else {
              aggregate.draws += 1;
            }
          }
        }
      }
    }
    for (const [index, firstMember] of members.entries()) {
      for (const secondMember of members.slice(index + 1)) {
        // Teammates are not opponents: their meeting count would poison the
        // rematch penalty and the opponent-strength tie-breakers.
        if (teams !== null && firstMember.teamId === secondMember.teamId) {
          continue;
        }
        const firstId = firstMember.playerId;
        const secondId = secondMember.playerId;
        const first = ensure(firstId);
        const second = ensure(secondId);
        first.opponents.set(secondId, (first.opponents.get(secondId) ?? 0) + 1);
        second.opponents.set(firstId, (second.opponents.get(firstId) ?? 0) + 1);
      }
    }
  }

  for (const playerId of byePlayerIds) {
    const aggregate = ensure(playerId);
    aggregate.score += scoring.byePoints;
    aggregate.roundsPlayed += 1;
    aggregate.byes += 1;
  }

  return aggregates;
}

function sortedStandingRows(
  players: PodRosterPlayer[],
  aggregates: Map<string, PlayerAggregate>,
): PodStandingRow[] {
  const scoreOf = (id: string): number => aggregates.get(id)?.score ?? 0;
  const gamePointsOf = (id: string): number => aggregates.get(id)?.gamePoints ?? 0;
  const meanOver = (ids: string[], valueOf: (id: string) => number): number =>
    ids.length === 0 ? 0 : ids.reduce((sum, id) => sum + valueOf(id), 0) / ids.length;
  const rows: PodStandingRow[] = players.map((player) => {
    const aggregate = aggregates.get(player.id);
    const opponents = aggregate ? [...aggregate.opponents.keys()] : [];
    return {
      playerId: player.id,
      displayName: player.displayName,
      status: player.status,
      droppedAfterRound: player.droppedAfterRound,
      teamId: player.teamId,
      score: aggregate?.score ?? 0,
      gamePoints: aggregate?.gamePoints ?? 0,
      roundsPlayed: aggregate?.roundsPlayed ?? 0,
      pods3Count: aggregate?.pods3 ?? 0,
      pods4Count: aggregate?.pods4 ?? 0,
      byeCount: aggregate?.byes ?? 0,
      podWins: aggregate?.podWins ?? 0,
      wins: aggregate?.wins ?? 0,
      draws: aggregate?.draws ?? 0,
      losses: aggregate?.losses ?? 0,
      region: player.region,
      avgOpponentScore: meanOver(opponents, scoreOf),
      avgOpponentGamePoints: meanOver(opponents, gamePointsOf),
    };
  });
  // Final tiebreak must be a deterministic id hash, not a fresh random draw,
  // or standings reshuffle every refresh. Hash the team id first.
  return rows.toSorted(
    (a, b) =>
      b.score - a.score ||
      b.podWins - a.podWins ||
      b.avgOpponentScore - a.avgOpponentScore ||
      b.gamePoints - a.gamePoints ||
      b.avgOpponentGamePoints - a.avgOpponentGamePoints ||
      tieBreakKey(a.teamId ?? a.playerId) - tieBreakKey(b.teamId ?? b.playerId) ||
      tieBreakKey(a.playerId) - tieBreakKey(b.playerId),
  );
}

// Kysely commits a transaction unless the callback throws; this lets a race
// roll the transaction back without surfacing a transport-level AppError.
class TeamRaceLostError extends Error {
  override name = "TeamRaceLostError";
}

/**
 * The pod-engine tables: rounds, pods, pod members, byes, and the roster/team
 * side of `tournament_participants`. The `tournaments` row itself belongs to
 * `tournamentsRepo` — there is one tournament row and one `Tournament` type,
 * and this repo takes ids.
 *
 * Lean model: player aggregates and opponent history are NOT stored; they are
 * derived on read from the finalized rounds via `foldFinalized`. Stored values
 * are the raw facts (pod_members.placement) and the engine's write-once
 * outputs (round/pod penalties). Authorization is the caller's job; the repo is
 * naive.
 */
export function podTournamentsRepo(db: Kysely<Database>) {
  function loadFinalizedRows(tournamentId: string): Promise<FinalizedMemberRow[]> {
    return db
      .selectFrom("podRounds as r")
      .innerJoin("pods as p", "p.roundId", "r.id")
      .innerJoin("podMembers as m", "m.podId", "p.id")
      .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
      .select([
        "p.id as podId",
        "p.size as size",
        "m.playerId as playerId",
        "pl.teamId as teamId",
        "m.placement as placement",
        "m.gamePoints as gamePoints",
      ])
      .where("r.tournamentId", "=", tournamentId)
      .where("r.status", "=", "finalized")
      .execute();
  }

  // One row per finalized bye (a player id, repeated if they byed in many rounds).
  async function loadFinalizedByePlayerIds(tournamentId: string): Promise<string[]> {
    const rows = await db
      .selectFrom("podByes as b")
      .innerJoin("podRounds as r", "r.id", "b.roundId")
      .select("b.playerId as playerId")
      .where("r.tournamentId", "=", tournamentId)
      .where("r.status", "=", "finalized")
      .execute();
    return rows.map((row) => row.playerId);
  }

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

    async loadPairingSnapshot(
      tournamentId: string,
      scoring: PodScoring,
    ): Promise<PairingSnapshotPlayer[]> {
      // All participants, not just active: dropped opponents still carry the
      // regions the region history is counted against.
      const [players, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .select(["id", "region", "fixedTable", "status", "teamId"])
          .where("tournamentId", "=", tournamentId)
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
      const regionById = new Map(players.map((player) => [player.id, player.region]));
      return players
        .filter((player) => player.status === "active")
        .map((player) => {
          const aggregate = aggregates.get(player.id);
          return {
            id: player.id,
            teamId: player.teamId,
            score: aggregate?.score ?? 0,
            pods3: aggregate?.pods3 ?? 0,
            pods4: aggregate?.pods4 ?? 0,
            byes: aggregate?.byes ?? 0,
            opponents: aggregate?.opponents ?? new Map(),
            region: player.region,
            regionHistory: regionHistoryFrom(aggregate?.opponents, regionById),
            fixedTable: player.fixedTable,
          };
        });
    },

    /**
     * Snapshot of EVERY player (active or dropped) for the organizer's open-round
     * warnings and manual editor, with `opponents` as a plain record so it
     * serializes over the wire. Dropped players are included because a player
     * dropped while a round is open still sits in that round's pods.
     */
    async loadOpenRoundSnapshot(
      tournamentId: string,
      scoring: PodScoring,
    ): Promise<PodSnapshotPlayer[]> {
      const [players, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .select(["id", "region", "fixedTable", "teamId"])
          .where("tournamentId", "=", tournamentId)
          .where("status", "in", ROSTER_STATUSES)
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
      const regionById = new Map(players.map((player) => [player.id, player.region]));
      return players.map((player) => {
        const aggregate = aggregates.get(player.id);
        return {
          playerId: player.id,
          teamId: player.teamId,
          score: aggregate?.score ?? 0,
          pods3: aggregate?.pods3 ?? 0,
          pods4: aggregate?.pods4 ?? 0,
          byes: aggregate?.byes ?? 0,
          opponents: aggregate ? Object.fromEntries(aggregate.opponents) : {},
          region: player.region,
          regionHistory: Object.fromEntries(regionHistoryFrom(aggregate?.opponents, regionById)),
          fixedTable: player.fixedTable,
        };
      });
    },

    async computeStandings(tournamentId: string, scoring: PodScoring): Promise<PodStandingRow[]> {
      const [players, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .selectAll()
          .where("tournamentId", "=", tournamentId)
          .where("status", "in", ROSTER_STATUSES)
          .$narrowType<{ status: PodPlayerStatus }>()
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
      return sortedStandingRows(players, aggregates);
    },

    /** A tournament with no finalized rounds or byes is absent from the map. */
    async winnersAcross(
      tournaments: { id: string; scoring: PodScoring }[],
    ): Promise<Map<string, { participantId: string; displayName: string }>> {
      if (tournaments.length === 0) {
        return new Map();
      }
      const ids = tournaments.map((tournament) => tournament.id);
      const [players, memberRows, byeRows] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .selectAll()
          .where("tournamentId", "in", ids)
          .where("status", "in", ROSTER_STATUSES)
          .$narrowType<{ status: PodPlayerStatus }>()
          .orderBy("createdAt", "asc")
          .execute(),
        db
          .selectFrom("podRounds as r")
          .innerJoin("pods as p", "p.roundId", "r.id")
          .innerJoin("podMembers as m", "m.podId", "p.id")
          .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
          .select([
            "r.tournamentId as tournamentId",
            "p.id as podId",
            "p.size as size",
            "m.playerId as playerId",
            "pl.teamId as teamId",
            "m.placement as placement",
            "m.gamePoints as gamePoints",
          ])
          .where("r.tournamentId", "in", ids)
          .where("r.status", "=", "finalized")
          .execute(),
        db
          .selectFrom("podByes as b")
          .innerJoin("podRounds as r", "r.id", "b.roundId")
          .select(["r.tournamentId as tournamentId", "b.playerId as playerId"])
          .where("r.tournamentId", "in", ids)
          .where("r.status", "=", "finalized")
          .execute(),
      ]);
      const playersByTournament = Map.groupBy(players, (player) => player.tournamentId);
      const membersByTournament = Map.groupBy(memberRows, (row) => row.tournamentId);
      const byesByTournament = Map.groupBy(byeRows, (row) => row.tournamentId);
      const winners = new Map<string, { participantId: string; displayName: string }>();
      for (const tournament of tournaments) {
        const finalized = membersByTournament.get(tournament.id) ?? [];
        const byes = (byesByTournament.get(tournament.id) ?? []).map((row) => row.playerId);
        if (finalized.length === 0 && byes.length === 0) {
          continue;
        }
        const aggregates = foldFinalized(finalized, byes, tournament.scoring);
        const rows = sortedStandingRows(playersByTournament.get(tournament.id) ?? [], aggregates);
        const top = rows[0];
        if (top) {
          // A 2v2 winner is the whole team: both member names, teammates being
          // adjacent in the sorted rows.
          const displayName =
            top.teamId === null
              ? top.displayName
              : rows
                  .filter((row) => row.teamId === top.teamId)
                  .map((row) => row.displayName)
                  .join(" & ");
          winners.set(tournament.id, { participantId: top.playerId, displayName });
        }
      }
      return winners;
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
