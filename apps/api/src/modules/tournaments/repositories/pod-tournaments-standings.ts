import type { PairingPlayer } from "@openrift/shared/pairing/types";
import type {
  PodPlayerStatus,
  PodSnapshotPlayer,
  PodStandingRow,
} from "@openrift/shared/types/api/pod-tournament";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PodScoring } from "../lib/pod-scoring.js";
import {
  podSizeOf,
  pointsForPod,
  pointsForTeamPod,
  teamsOf,
} from "../lib/pod-tournament-presenters.js";
import type { PodRosterPlayer } from "./pod-tournaments-shared.js";
import { ROSTER_STATUSES } from "./pod-tournaments-shared.js";

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

/**
 * Standings and pairing snapshots. Lean model: player aggregates and opponent
 * history are NOT stored; they are derived on read from the finalized rounds
 * via `foldFinalized`.
 */
export function podStandingsRepo(db: Kysely<Database>) {
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

  return {
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
  };
}
