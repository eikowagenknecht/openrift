import { pointsForPlacements } from "@openrift/shared";
import type {
  PairingPlayer,
  PairingResult,
  PodPenaltyBreakdown,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodStandingRow,
  PodTournamentStatus,
  ScoringScheme,
} from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";

import type {
  Database,
  PodPlayersTable,
  PodRoundsTable,
  PodsTable,
  PodTournamentsTable,
} from "../db/index.js";

export type PodTournament = Selectable<PodTournamentsTable>;
export type PodPlayer = Selectable<PodPlayersTable>;
export type PodRound = Selectable<PodRoundsTable>;
export type Pod = Selectable<PodsTable>;

export interface PodTournamentSummary extends PodTournament {
  playerCount: number;
  activePlayerCount: number;
  roundCount: number;
}

export interface NewPodTournament {
  ownerUserId: string;
  name: string;
}

/** Pod context for a result submission: the pod, its round, owning tournament, and member ids. */
export interface PodForResult {
  pod: Pod;
  round: PodRound;
  tournament: PodTournament;
  memberPlayerIds: string[];
}

/** Per-player aggregate, derived from the finalized rounds (the lean model's source of truth). */
interface PlayerAggregate {
  score: number;
  pods3: number;
  pods4: number;
  roundsPlayed: number;
  opponents: Map<string, number>;
}

interface FinalizedMemberRow {
  podId: string;
  size: number;
  playerId: string;
  placement: number | null;
}

// jsonb can come back as a parsed object (postgres.js) or a string (Bun); normalize.
function parseBreakdown(value: unknown): PodPenaltyBreakdown {
  return (typeof value === "string" ? JSON.parse(value) : value) as PodPenaltyBreakdown;
}

function emptyAggregate(): PlayerAggregate {
  return { score: 0, pods3: 0, pods4: 0, roundsPlayed: 0, opponents: new Map() };
}

/**
 * Fold the finalized pod/member rows into per-player aggregates. Points are
 * derived per pod via the pure scorer; opponent counts come from co-membership.
 * @returns A map from player id to their derived aggregate.
 */
function foldFinalized(
  rows: FinalizedMemberRow[],
  scheme: ScoringScheme,
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
    const size = members[0]?.size === 3 ? 3 : 4;
    const points = pointsForPlacements(
      members.map((member) => member.placement ?? 0),
      size,
      scheme,
    );
    members.forEach((member, index) => {
      const aggregate = ensure(member.playerId);
      aggregate.score += points[index] ?? 0;
      aggregate.roundsPlayed += 1;
      if (size === 3) {
        aggregate.pods3 += 1;
      } else {
        aggregate.pods4 += 1;
      }
    });
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
  return aggregates;
}

interface PodMemberRow {
  podId: string;
  playerId: string;
  displayName: string;
  placement: number | null;
}

function toPodResponse(pod: Pod, memberRows: PodMemberRow[], scheme: ScoringScheme): PodResponse {
  const size = pod.size === 3 ? 3 : 4;
  const reported =
    pod.resultStatus === "reported" && memberRows.every((member) => member.placement !== null);
  const points = reported
    ? pointsForPlacements(
        memberRows.map((member) => member.placement ?? 0),
        size,
        scheme,
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
    },
  };
}

function toRoundResponse(
  round: PodRound,
  podRows: Pod[],
  membersByPod: Map<string, PodMemberRow[]>,
  scheme: ScoringScheme,
): PodRoundResponse {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    pairingStrategy: round.pairingStrategy,
    penaltyTotal: round.penaltyTotal,
    createdAt: round.createdAt.toISOString(),
    finalizedAt: round.finalizedAt ? round.finalizedAt.toISOString() : null,
    pods: podRows.map((pod) => toPodResponse(pod, membersByPod.get(pod.id) ?? [], scheme)),
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
      ])
      .where("r.tournamentId", "=", tournamentId)
      .where("r.status", "=", "finalized")
      .execute();
  }

  return {
    // ── Tournaments ────────────────────────────────────────────────────────
    /** @returns Owner's tournaments, newest first, with derived counts. */
    async listForOwner(ownerUserId: string): Promise<PodTournamentSummary[]> {
      const rows = await db
        .selectFrom("podTournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("podPlayers as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("playerCount"),
          eb
            .selectFrom("podPlayers as p")
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
        .where("t.ownerUserId", "=", ownerUserId)
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
      return db.selectFrom("podTournaments").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns The tournament whose report token matches, or `undefined`. */
    findByReportToken(token: string): Promise<PodTournament | undefined> {
      return db
        .selectFrom("podTournaments")
        .selectAll()
        .where("reportToken", "=", token)
        .executeTakeFirst();
    },

    /** @returns The created tournament row. */
    create(values: NewPodTournament): Promise<PodTournament> {
      return db
        .insertInto("podTournaments")
        .values({ ownerUserId: values.ownerUserId, name: values.name })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The updated tournament, or `undefined` if it was not found. */
    update(
      id: string,
      patch: { name?: string; status?: PodTournamentStatus; currentRound?: number },
    ): Promise<PodTournament | undefined> {
      return db
        .updateTable("podTournaments")
        .set(patch)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("podTournaments").where("id", "=", id).execute();
    },

    /**
     * Sets (rotate/enable) or clears (`null` disables) the participant report token.
     * @returns The updated tournament, or `undefined` if it was not found.
     */
    setReportToken(id: string, token: string | null): Promise<PodTournament | undefined> {
      return db
        .updateTable("podTournaments")
        .set({ reportToken: token })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    // ── Players ────────────────────────────────────────────────────────────
    listPlayers(tournamentId: string): Promise<PodPlayer[]> {
      return db
        .selectFrom("podPlayers")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("createdAt", "asc")
        .execute();
    },

    findPlayer(playerId: string): Promise<PodPlayer | undefined> {
      return db.selectFrom("podPlayers").selectAll().where("id", "=", playerId).executeTakeFirst();
    },

    addPlayer(tournamentId: string, displayName: string): Promise<PodPlayer> {
      return db
        .insertInto("podPlayers")
        .values({ tournamentId, displayName })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    renamePlayer(playerId: string, displayName: string): Promise<PodPlayer | undefined> {
      return db
        .updateTable("podPlayers")
        .set({ displayName })
        .where("id", "=", playerId)
        .returningAll()
        .executeTakeFirst();
    },

    dropPlayer(playerId: string, droppedAfterRound: number): Promise<PodPlayer | undefined> {
      return db
        .updateTable("podPlayers")
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
        .updateTable("podPlayers")
        .set({ status: "active", droppedAfterRound: null })
        .where("id", "=", playerId)
        .returningAll()
        .executeTakeFirst();
    },

    async deletePlayer(playerId: string): Promise<void> {
      await db.deleteFrom("podPlayers").where("id", "=", playerId).execute();
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
     * Atomic insert of a round, its pods, and their (result-less) members.
     * @returns The created round.
     */
    createRound(
      tournamentId: string,
      roundNumber: number,
      pairing: PairingResult,
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

        for (let index = 0; index < pairing.pods.length; index++) {
          const pod = pairing.pods[index];
          const breakdown = pairing.perPod[index];
          const podRow = await trx
            .insertInto("pods")
            .values({
              roundId: round.id,
              podNumber: index + 1,
              size: pod.size,
              penaltyBreakdown: JSON.stringify(breakdown),
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          await trx
            .insertInto("podMembers")
            .values(
              pod.playerIds.map((playerId) => ({ podId: podRow.id, playerId, placement: null })),
            )
            .execute();
        }
        return round;
      });
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
        .selectFrom("podTournaments")
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

    /** Writes each member's placement and flips the pod to `reported`, atomically. */
    async setPodResult(
      podId: string,
      placements: { playerId: string; placement: number }[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        for (const { playerId, placement } of placements) {
          await trx
            .updateTable("podMembers")
            .set({ placement })
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
          .updateTable("podTournaments")
          .set({ currentRound: newCurrentRound })
          .where("id", "=", tournamentId)
          .execute();
      });
    },

    // ── Derived reads (the lean model) ───────────────────────────────────────
    /** @returns Active players as engine snapshots, aggregates derived from finalized rounds. */
    async loadPairingSnapshot(
      tournamentId: string,
      scheme: PodScoringScheme,
    ): Promise<PairingPlayer[]> {
      const [activePlayers, finalizedRows] = await Promise.all([
        db
          .selectFrom("podPlayers")
          .select(["id"])
          .where("tournamentId", "=", tournamentId)
          .where("status", "=", "active")
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, scheme);
      return activePlayers.map((player) => {
        const aggregate = aggregates.get(player.id);
        return {
          id: player.id,
          score: aggregate?.score ?? 0,
          pods3: aggregate?.pods3 ?? 0,
          pods4: aggregate?.pods4 ?? 0,
          opponents: aggregate?.opponents ?? new Map(),
        };
      });
    },

    /** @returns All players as standings rows (score desc, stable by registration order). */
    async computeStandings(
      tournamentId: string,
      scheme: PodScoringScheme,
    ): Promise<PodStandingRow[]> {
      const [players, finalizedRows] = await Promise.all([
        db
          .selectFrom("podPlayers")
          .selectAll()
          .where("tournamentId", "=", tournamentId)
          .orderBy("createdAt", "asc")
          .execute(),
        loadFinalizedRows(tournamentId),
      ]);
      const aggregates = foldFinalized(finalizedRows, scheme);
      const rows: PodStandingRow[] = players.map((player) => {
        const aggregate = aggregates.get(player.id);
        return {
          playerId: player.id,
          displayName: player.displayName,
          status: player.status,
          droppedAfterRound: player.droppedAfterRound,
          score: aggregate?.score ?? 0,
          roundsPlayed: aggregate?.roundsPlayed ?? 0,
          pods3Count: aggregate?.pods3 ?? 0,
          pods4Count: aggregate?.pods4 ?? 0,
        };
      });
      return rows.toSorted((a, b) => b.score - a.score);
    },

    /** @returns Every round with its pods and members (placements + derived points + penalty). */
    async loadRounds(tournamentId: string, scheme: PodScoringScheme): Promise<PodRoundResponse[]> {
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
      const memberRows =
        podIds.length === 0
          ? []
          : await db
              .selectFrom("podMembers as m")
              .innerJoin("podPlayers as pl", "pl.id", "m.playerId")
              .select(["m.podId", "m.playerId", "pl.displayName", "m.placement"])
              .where("m.podId", "in", podIds)
              .execute();
      const membersByPod = Map.groupBy(memberRows, (row) => row.podId);
      const podsByRound = Map.groupBy(pods, (pod) => pod.roundId);
      return rounds.map((round) =>
        toRoundResponse(round, podsByRound.get(round.id) ?? [], membersByPod, scheme),
      );
    },
  };
}
