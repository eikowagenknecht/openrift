import {
  placementsFromGamePoints,
  pointsForPlacements,
  swissPointsForPlacements,
} from "@openrift/shared";
import type {
  PairingPlayer,
  PairingResult,
  PodPenaltyBreakdown,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodSnapshotPlayer,
  PodStandingRow,
  PodTournamentStatus,
} from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";

import type {
  Database,
  PodRoundsTable,
  PodsTable,
  TournamentParticipantsTable,
  TournamentsTable,
} from "../db/index.js";

export type PodTournament = Selectable<TournamentsTable>;
export type PodPlayer = Selectable<TournamentParticipantsTable>;
export type PodRound = Selectable<PodRoundsTable>;
export type Pod = Selectable<PodsTable>;

export interface PodTournamentSummary extends PodTournament {
  playerCount: number;
  activePlayerCount: number;
  roundCount: number;
}

export interface NewPodTournament {
  hostUserId: string;
  name: string;
}

/** Pod context for a result submission: the pod, its round, owning tournament, and member ids. */
export interface PodForResult {
  pod: Pod;
  round: PodRound;
  tournament: PodTournament;
  memberPlayerIds: string[];
}

/**
 * The per-tournament scoring knobs the derive-on-read model needs: the FFA
 * placement scheme for 3/4-pods, win/draw points for Swiss matches (2-pods),
 * and the bye points shared by both.
 */
export interface PodScoring {
  scheme: PodScoringScheme;
  byePoints: number;
  winPoints: number;
  drawPoints: number;
}

/**
 * Pluck the scoring knobs off a tournament row.
 *
 * @param tournament The tournament row.
 * @returns The scoring context for the derived reads.
 */
export function scoringOf(tournament: PodTournament): PodScoring {
  return {
    scheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    winPoints: tournament.winPoints,
    drawPoints: tournament.drawPoints,
  };
}

// Narrow a stored pod size to the literal union (the CHECK guarantees 2/3/4).
function podSizeOf(value: number): 2 | 3 | 4 {
  return value === 2 ? 2 : value === 3 ? 3 : 4;
}

// Points per member for one pod: Swiss win/draw points for a match (size 2),
// the placement tables for a 3/4 FFA pod.
function pointsForPod(placements: number[], size: 2 | 3 | 4, scoring: PodScoring): number[] {
  if (size === 2) {
    return swissPointsForPlacements(placements, scoring.winPoints, scoring.drawPoints);
  }
  return pointsForPlacements(placements, size, scoring.scheme);
}

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

// jsonb can come back as a parsed object (postgres.js) or a string (Bun); normalize.
function parseBreakdown(value: unknown): PodPenaltyBreakdown {
  return (typeof value === "string" ? JSON.parse(value) : value) as PodPenaltyBreakdown;
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

/**
 * Fold the finalized pod/member rows (and finalized byes) into per-player
 * aggregates. Scheme points are derived per pod from placement via the pure
 * scorer; raw game points are summed for the tie-breaker; opponent counts come
 * from co-membership; a sole 1st place is a pod win; a bye adds the tournament's
 * bye points and a round played but no opponents or pod tally.
 *
 * @param rows The finalized pod-member rows.
 * @param byePlayerIds One entry per finalized bye (a player id, repeated per bye).
 * @param scoring The tournament's scoring knobs.
 * @returns A map from player id to their derived aggregate.
 */
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
    const points = pointsForPod(
      members.map((member) => member.placement ?? 0),
      size,
      scoring,
    );
    members.forEach((member, index) => {
      const aggregate = ensure(member.playerId);
      aggregate.score += points[index] ?? 0;
      aggregate.gamePoints += member.gamePoints ?? 0;
      aggregate.roundsPlayed += 1;
      if (size === 3) {
        aggregate.pods3 += 1;
      } else if (size === 4) {
        aggregate.pods4 += 1;
      }
    });
    // Pod win = sole 1st place: the unique lowest placement value in the pod.
    const placements = members
      .map((member) => member.placement)
      .filter((value): value is number => value !== null);
    if (placements.length === members.length && members.length > 0) {
      const best = Math.min(...placements);
      const leaders = members.filter((member) => member.placement === best);
      if (leaders.length === 1) {
        ensure(leaders[0].playerId).podWins += 1;
      }
      // The Swiss match record: a 2-pod is a win/draw/loss per member.
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
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const firstId = members[i].playerId;
        const secondId = members[j].playerId;
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

interface PodMemberRow {
  podId: string;
  playerId: string;
  displayName: string;
  placement: number | null;
  gamePoints: number | null;
}

function toPodResponse(pod: Pod, memberRows: PodMemberRow[], scoring: PodScoring): PodResponse {
  const size = podSizeOf(pod.size);
  const reported =
    pod.resultStatus === "reported" && memberRows.every((member) => member.placement !== null);
  const points = reported
    ? pointsForPod(
        memberRows.map((member) => member.placement ?? 0),
        size,
        scoring,
      )
    : null;
  const breakdown = parseBreakdown(pod.penaltyBreakdown);
  return {
    id: pod.id,
    podNumber: pod.podNumber,
    size,
    resultStatus: pod.resultStatus,
    members: memberRows.map((member, index) => ({
      playerId: member.playerId,
      displayName: member.displayName,
      gamePoints: member.gamePoints,
      placement: member.placement,
      points: points ? (points[index] ?? null) : null,
    })),
    penalty: {
      total: breakdown.total,
      rematchPairs: breakdown.rematchPairs,
      spread: breakdown.spread,
      scoreSpread: breakdown.scoreSpread,
      imbalance: breakdown.imbalance,
      float: breakdown.float,
      threePodRepeat: breakdown.threePodRepeat,
      // Breakdowns stored before the region feature lack this key.
      sameRegion: breakdown.sameRegion ?? 0,
    },
  };
}

interface PodByeRow {
  roundId: string;
  playerId: string;
  displayName: string;
}

function toRoundResponse(
  round: PodRound,
  podRows: Pod[],
  membersByPod: Map<string, PodMemberRow[]>,
  byeRows: PodByeRow[],
  scoring: PodScoring,
): PodRoundResponse {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    pairingStrategy: round.pairingStrategy,
    penaltyTotal: round.penaltyTotal,
    createdAt: round.createdAt.toISOString(),
    finalizedAt: round.finalizedAt ? round.finalizedAt.toISOString() : null,
    pods: podRows.map((pod) => toPodResponse(pod, membersByPod.get(pod.id) ?? [], scoring)),
    byes: byeRows.map((bye) => ({ playerId: bye.playerId, displayName: bye.displayName })),
  };
}

/**
 * Pod tournaments (ADR-022). Lean model: player aggregates and opponent history
 * are NOT stored; they are derived on read from the finalized rounds via
 * {@link foldFinalized}. Stored values are the raw facts (pod_members.placement)
 * and the engine's write-once outputs (round/pod penalties). Authorization is
 * the caller's job; the repo is naive.
 *
 * @returns Pod-tournament query methods bound to `db`.
 */
export function podTournamentsRepo(db: Kysely<Database>) {
  function loadFinalizedRows(tournamentId: string): Promise<FinalizedMemberRow[]> {
    return db
      .selectFrom("podRounds as r")
      .innerJoin("pods as p", "p.roundId", "r.id")
      .innerJoin("podMembers as m", "m.podId", "p.id")
      .select([
        "p.id as podId",
        "p.size as size",
        "m.playerId as playerId",
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

  // Insert a round's pods (+ their result-less members) and byes inside a trx.
  async function writePodsAndByes(
    trx: Kysely<Database>,
    roundId: string,
    pairing: PairingResult,
    byePlayerIds: string[],
  ): Promise<void> {
    for (let index = 0; index < pairing.pods.length; index++) {
      const pod = pairing.pods[index];
      const breakdown = pairing.perPod[index];
      const podRow = await trx
        .insertInto("pods")
        .values({
          roundId,
          podNumber: index + 1,
          size: pod.size,
          penaltyBreakdown: JSON.stringify(breakdown),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("podMembers")
        .values(pod.playerIds.map((playerId) => ({ podId: podRow.id, playerId, placement: null })))
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
    // ── Tournaments ────────────────────────────────────────────────────────
    /** @returns Owner's tournaments, newest first, with derived counts. */
    async listForOwner(hostUserId: string): Promise<PodTournamentSummary[]> {
      const rows = await db
        .selectFrom("tournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("playerCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "active")
            .as("activePlayerCount"),
          eb
            .selectFrom("podRounds as r")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("r.tournamentId", "=", "t.id")
            .as("roundCount"),
        ])
        .where("t.hostUserId", "=", hostUserId)
        .orderBy("t.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...row,
        playerCount: Number(row.playerCount ?? 0),
        activePlayerCount: Number(row.activePlayerCount ?? 0),
        roundCount: Number(row.roundCount ?? 0),
      }));
    },

    /** @returns The tournament, or `undefined` if no tournament has that id. */
    findById(id: string): Promise<PodTournament | undefined> {
      return db.selectFrom("tournaments").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /**
     * Resolves a follow-along link by either the report (read+write) or the
     * follow (read-only) token. The caller decides write permission by comparing
     * the matched token against `reportToken`.
     * @returns The tournament whose report or follow token matches, or `undefined`.
     */
    findByShareToken(token: string): Promise<PodTournament | undefined> {
      return db
        .selectFrom("tournaments")
        .selectAll()
        .where((eb) => eb.or([eb("reportToken", "=", token), eb("followToken", "=", token)]))
        .executeTakeFirst();
    },

    /** @returns The created tournament row (a user-hosted pod tournament). */
    create(values: NewPodTournament): Promise<PodTournament> {
      return db
        .insertInto("tournaments")
        .values({ hostType: "user", hostUserId: values.hostUserId, name: values.name })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The updated tournament, or `undefined` if it was not found. */
    update(
      id: string,
      patch: {
        name?: string;
        status?: PodTournamentStatus;
        currentRound?: number;
        scoringScheme?: PodScoringScheme;
        byePoints?: number;
      },
    ): Promise<PodTournament | undefined> {
      return db
        .updateTable("tournaments")
        .set(patch)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("tournaments").where("id", "=", id).execute();
    },

    /**
     * Sets (rotate/enable) or clears (`null` disables) the participant report token.
     * @returns The updated tournament, or `undefined` if it was not found.
     */
    setReportToken(id: string, token: string | null): Promise<PodTournament | undefined> {
      return db
        .updateTable("tournaments")
        .set({ reportToken: token })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Sets (enable) or clears (`null` disables) the read-only follow-along token.
     * @returns The updated tournament, or `undefined` if it was not found.
     */
    setFollowToken(id: string, token: string | null): Promise<PodTournament | undefined> {
      return db
        .updateTable("tournaments")
        .set({ followToken: token })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    // ── Players ────────────────────────────────────────────────────────────
    listPlayers(tournamentId: string): Promise<PodPlayer[]> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
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

    /**
     * Undo a drop: the player is active again and paired from the next round; results are retained.
     * @returns The reactivated player, or `undefined` if not found.
     */
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

    /** @returns True if the player is in any pod (so they cannot be hard-deleted). */
    async playerHasMemberships(playerId: string): Promise<boolean> {
      const row = await db
        .selectFrom("podMembers")
        .select("podId")
        .where("playerId", "=", playerId)
        .executeTakeFirst();
      return row !== undefined;
    },

    // ── Rounds / pods ──────────────────────────────────────────────────────
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

    /**
     * Atomic insert of a round, its pods and their (result-less) members, and any
     * byes (players the organizer sat out this round).
     * @returns The created round.
     */
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

    /**
     * Replace an open round's pairing in place (organizer manual edit): wipe its
     * pods, members, and byes, then re-insert the new partition. Keeps the same
     * round row and number; updates the stored penalty and marks it manual.
     * @returns Nothing.
     */
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

    /** @returns The player ids byed in this round (used to preserve byes on re-roll). */
    async listRoundByePlayerIds(roundId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("podByes")
        .select("playerId")
        .where("roundId", "=", roundId)
        .execute();
      return rows.map((row) => row.playerId);
    },

    /** @returns The player ids seated in any pod of this round (for the manual-edit coverage check). */
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

    /** @returns The pod plus its round, tournament, and member ids — or `undefined`. */
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
      const tournament = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", round.tournamentId)
        .executeTakeFirst();
      if (!tournament) {
        return undefined;
      }
      const memberRows = await db
        .selectFrom("podMembers")
        .select("playerId")
        .where("podId", "=", podId)
        .execute();
      return { pod, round, tournament, memberPlayerIds: memberRows.map((row) => row.playerId) };
    },

    /** Writes each member's game points + derived placement and flips the pod to `reported`. */
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
     * Writes a single member's game points (per-player self-reporting). Once every
     * member of the pod has points, derives the placements and flips the pod to
     * `reported` — the same completion `setPodResult` performs in one shot. The pod
     * row is locked for the transaction so two players submitting at the same time
     * serialize and the second one sees the first one's points.
     */
    async setMemberGamePoints(podId: string, playerId: string, gamePoints: number): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.selectFrom("pods").select("id").where("id", "=", podId).forUpdate().execute();
        await trx
          .updateTable("podMembers")
          .set({ gamePoints })
          .where("podId", "=", podId)
          .where("playerId", "=", playerId)
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

    /** @returns True once every pod in the round is `reported`. */
    async allPodsReported(roundId: string): Promise<boolean> {
      const pending = await db
        .selectFrom("pods")
        .select("id")
        .where("roundId", "=", roundId)
        .where("resultStatus", "=", "pending")
        .executeTakeFirst();
      return pending === undefined;
    },

    /** @returns True if any pod in the round has a result (re-roll is then blocked). */
    async anyResultEntered(roundId: string): Promise<boolean> {
      const reported = await db
        .selectFrom("pods")
        .select("id")
        .where("roundId", "=", roundId)
        .where("resultStatus", "=", "reported")
        .executeTakeFirst();
      return reported !== undefined;
    },

    /** Finalizes the round and advances the tournament's finalized-round counter, atomically. */
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

    // ── Derived reads (the lean model) ───────────────────────────────────────
    /** @returns Active players as engine snapshots, aggregates derived from finalized rounds. */
    async loadPairingSnapshot(tournamentId: string, scoring: PodScoring): Promise<PairingPlayer[]> {
      const [activePlayers, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .select(["id", "region"])
          .where("tournamentId", "=", tournamentId)
          .where("status", "=", "active")
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
      return activePlayers.map((player) => {
        const aggregate = aggregates.get(player.id);
        return {
          id: player.id,
          score: aggregate?.score ?? 0,
          pods3: aggregate?.pods3 ?? 0,
          pods4: aggregate?.pods4 ?? 0,
          byes: aggregate?.byes ?? 0,
          opponents: aggregate?.opponents ?? new Map(),
          region: player.region,
        };
      });
    },

    /**
     * Snapshot of EVERY player (active or dropped) for the organizer's open-round
     * warnings and manual editor, with `opponents` as a plain record so it
     * serializes over the wire. Dropped players are included because a player
     * dropped while a round is open still sits in that round's pods.
     * @returns One serializable snapshot row per player in the tournament.
     */
    async loadOpenRoundSnapshot(
      tournamentId: string,
      scoring: PodScoring,
    ): Promise<PodSnapshotPlayer[]> {
      const [players, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .select(["id", "region"])
          .where("tournamentId", "=", tournamentId)
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
      return players.map((player) => {
        const aggregate = aggregates.get(player.id);
        return {
          playerId: player.id,
          score: aggregate?.score ?? 0,
          pods3: aggregate?.pods3 ?? 0,
          pods4: aggregate?.pods4 ?? 0,
          byes: aggregate?.byes ?? 0,
          opponents: aggregate ? Object.fromEntries(aggregate.opponents) : {},
          region: player.region,
        };
      });
    },

    /**
     * @returns All players as standings rows, sorted by the tie-break order:
     *   tournament score → pod wins → average opponent score → game points →
     *   average opponent game points → random (a stable per-player draw).
     */
    async computeStandings(tournamentId: string, scoring: PodScoring): Promise<PodStandingRow[]> {
      const [players, finalizedRows, finalizedByes] = await Promise.all([
        db
          .selectFrom("tournamentParticipants")
          .selectAll()
          .where("tournamentId", "=", tournamentId)
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
        loadFinalizedByePlayerIds(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, finalizedByes, scoring);
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
      // Final fallback is "random", but a fresh draw on every read would reshuffle
      // tied players each refresh; instead derive a stable per-player draw from the
      // id hash so the arbitrary order holds across reads.
      return rows.toSorted(
        (a, b) =>
          b.score - a.score ||
          b.podWins - a.podWins ||
          b.avgOpponentScore - a.avgOpponentScore ||
          b.gamePoints - a.gamePoints ||
          b.avgOpponentGamePoints - a.avgOpponentGamePoints ||
          tieBreakKey(a.playerId) - tieBreakKey(b.playerId),
      );
    },

    /** @returns Every round with its pods and members (placements + derived points + penalty). */
    async loadRounds(tournamentId: string, scoring: PodScoring): Promise<PodRoundResponse[]> {
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
              .select(["m.podId", "m.playerId", "pl.displayName", "m.placement", "m.gamePoints"])
              .where("m.podId", "in", podIds)
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
      return rounds.map((round) =>
        toRoundResponse(
          round,
          podsByRound.get(round.id) ?? [],
          membersByPod,
          byesByRound.get(round.id) ?? [],
          scoring,
        ),
      );
    },
  };
}
