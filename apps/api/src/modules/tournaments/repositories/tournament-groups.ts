import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import type { PodPenaltyBreakdown } from "@openrift/shared/pairing/types";
import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { TournamentGroupsTable } from "../../../db/tables/tournaments.js";

export type TournamentGroup = Selectable<TournamentGroupsTable>;

export interface GroupInsert {
  label: string;
  /** Label of the paired 3-player group, null for a 4-player group. */
  pairedWith: string | null;
  /** Slot order. */
  playerIds: string[];
}

export interface GroupPodInsert {
  podNumber: number;
  /** Seat order; in a cut pod the higher seed comes first. */
  playerIds: [string, string];
  /** A walkover is written reported with placements only; null stays pending. */
  placements: [number, number] | null;
}

export interface LegendMetaShareRow {
  legendCardId: string;
  legendName: string | null;
  share: number;
}

export interface PendingGroupPod {
  podId: string;
  members: { playerId: string; status: string }[];
}

const GROUP_STAGE_STRATEGY = "group_stage";
const CUT_STRATEGY = "cut";

const NO_PENALTY: PodPenaltyBreakdown = {
  rematch: 0,
  scoreSpread: 0,
  imbalance: 0,
  float: 0,
  threePodRepeat: 0,
  sameRegion: 0,
  repeatedRegion: 0,
  total: 0,
  rematchPairs: 0,
  spread: 0,
};

export function tournamentGroupsRepo(db: Kysely<Database>) {
  /** Serializes the writes of one tournament: self-paced starts and the cut race each other. */
  async function lockTournament(trx: Kysely<Database>, tournamentId: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtext(${tournamentId}))`.execute(trx);
  }

  async function roundExistsFrom(
    trx: Kysely<Database>,
    tournamentId: string,
    roundNumber: number,
  ): Promise<boolean> {
    const row = await trx
      .selectFrom("podRounds")
      .select("id")
      .where("tournamentId", "=", tournamentId)
      .where("roundNumber", ">=", roundNumber)
      .executeTakeFirst();
    return row !== undefined;
  }

  async function writePods(
    trx: Kysely<Database>,
    roundId: string,
    pods: GroupPodInsert[],
  ): Promise<void> {
    for (const pod of pods) {
      const row = await trx
        .insertInto("pods")
        .values({
          roundId,
          podNumber: pod.podNumber,
          size: 2,
          penaltyBreakdown: NO_PENALTY,
          resultStatus: pod.placements ? "reported" : "pending",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("podMembers")
        .values(
          pod.playerIds.map((playerId, seat) => ({
            podId: row.id,
            playerId,
            seat,
            placement: pod.placements ? (pod.placements[seat] ?? null) : null,
            gamePoints: null,
          })),
        )
        .execute();
    }
  }

  return {
    listGroups(tournamentId: string): Promise<TournamentGroup[]> {
      return db
        .selectFrom("tournamentGroups")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("label", "asc")
        .execute();
    },

    async createGroupStage(input: {
      tournamentId: string;
      groups: GroupInsert[];
      firstRoundPods: GroupPodInsert[];
    }): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await lockTournament(trx, input.tournamentId);
        if (await roundExistsFrom(trx, input.tournamentId, 1)) {
          return;
        }
        const created = await trx
          .insertInto("tournamentGroups")
          .values(
            input.groups.map((group) => ({ tournamentId: input.tournamentId, label: group.label })),
          )
          .returning(["id", "label"])
          .execute();
        const idByLabel = new Map(created.map((row) => [row.label, row.id]));
        for (const group of input.groups) {
          const id = idByLabel.get(group.label);
          const pairedId = group.pairedWith === null ? null : idByLabel.get(group.pairedWith);
          if (id === undefined) {
            throw new Error(`group ${group.label} was not created`);
          }
          if (pairedId !== undefined && pairedId !== null) {
            await trx
              .updateTable("tournamentGroups")
              .set({ pairedGroupId: pairedId })
              .where("id", "=", id)
              .execute();
          }
          for (const [slot, playerId] of group.playerIds.entries()) {
            await trx
              .updateTable("tournamentParticipants")
              .set({ groupId: id, groupSlot: slot, updatedAt: new Date() })
              .where("id", "=", playerId)
              .execute();
          }
        }
        const rounds = await trx
          .insertInto("podRounds")
          .values(
            Array.from({ length: GROUP_STAGE_ROUNDS }, (_, index) => ({
              tournamentId: input.tournamentId,
              roundNumber: index + 1,
              status: "reporting" as const,
              penaltyTotal: 0,
              pairingStrategy: GROUP_STAGE_STRATEGY,
            })),
          )
          .returning(["id", "roundNumber"])
          .execute();
        const firstRound = rounds.find((round) => round.roundNumber === 1);
        if (!firstRound) {
          throw new Error("group stage round 1 was not created");
        }
        await writePods(trx, firstRound.id, input.firstRoundPods);
        await trx
          .updateTable("tournaments")
          .set({ currentRound: GROUP_STAGE_ROUNDS, updatedAt: new Date() })
          .where("id", "=", input.tournamentId)
          .execute();
        await trx
          .updateTable("tournaments")
          .set({ status: "running" })
          .where("id", "=", input.tournamentId)
          .where("status", "=", "setup")
          .execute();
      });
    },

    /** Idempotent: a second start of the same unit's round finds its pods and writes nothing. */
    async insertGroupPods(
      tournamentId: string,
      roundId: string,
      pods: GroupPodInsert[],
    ): Promise<void> {
      if (pods.length === 0) {
        return;
      }
      await db.transaction().execute(async (trx) => {
        await lockTournament(trx, tournamentId);
        const taken = await trx
          .selectFrom("podMembers as m")
          .innerJoin("pods as p", "p.id", "m.podId")
          .select("m.playerId as playerId")
          .where("p.roundId", "=", roundId)
          .where(
            "m.playerId",
            "in",
            pods.flatMap((pod) => pod.playerIds),
          )
          .executeTakeFirst();
        if (taken !== undefined) {
          return;
        }
        await writePods(trx, roundId, pods);
      });
    },

    async createCut(input: {
      tournamentId: string;
      roundNumber: number;
      seeds: { participantId: string; seed: number }[];
      pods: GroupPodInsert[];
    }): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await lockTournament(trx, input.tournamentId);
        if (await roundExistsFrom(trx, input.tournamentId, input.roundNumber)) {
          return;
        }
        await trx
          .updateTable("podRounds")
          .set({ status: "finalized", finalizedAt: new Date() })
          .where("tournamentId", "=", input.tournamentId)
          .where("roundNumber", "<=", GROUP_STAGE_ROUNDS)
          .where("status", "=", "reporting")
          .execute();
        await trx
          .updateTable("tournamentParticipants")
          .set({ seed: null, updatedAt: new Date() })
          .where("tournamentId", "=", input.tournamentId)
          .where("seed", "is not", null)
          .execute();
        for (const { participantId, seed } of input.seeds) {
          await trx
            .updateTable("tournamentParticipants")
            .set({ seed, updatedAt: new Date() })
            .where("id", "=", participantId)
            .execute();
        }
        const round = await trx
          .insertInto("podRounds")
          .values({
            tournamentId: input.tournamentId,
            roundNumber: input.roundNumber,
            status: "reporting",
            penaltyTotal: 0,
            pairingStrategy: CUT_STRATEGY,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await writePods(trx, round.id, input.pods);
        await trx
          .updateTable("tournaments")
          .set({ currentRound: input.roundNumber, updatedAt: new Date() })
          .where("id", "=", input.tournamentId)
          .execute();
      });
    },

    async createCutRound(
      tournamentId: string,
      roundNumber: number,
      pods: GroupPodInsert[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await lockTournament(trx, tournamentId);
        if (await roundExistsFrom(trx, tournamentId, roundNumber)) {
          return;
        }
        const round = await trx
          .insertInto("podRounds")
          .values({
            tournamentId,
            roundNumber,
            status: "reporting",
            penaltyTotal: 0,
            pairingStrategy: CUT_STRATEGY,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await writePods(trx, round.id, pods);
        await trx
          .updateTable("tournaments")
          .set({ currentRound: roundNumber, updatedAt: new Date() })
          .where("id", "=", tournamentId)
          .execute();
      });
    },

    async deleteRound(roundId: string, tournamentId: string, currentRound: number): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("podRounds").where("id", "=", roundId).execute();
        await trx
          .updateTable("tournaments")
          .set({ currentRound, updatedAt: new Date() })
          .where("id", "=", tournamentId)
          .execute();
      });
    },

    /** Re-rolling the groups: the three rounds, the groups and the slots go. */
    async deleteGroupStage(tournamentId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("podRounds")
          .where("tournamentId", "=", tournamentId)
          .where("roundNumber", "<=", GROUP_STAGE_ROUNDS)
          .execute();
        await trx
          .updateTable("tournamentParticipants")
          .set({ groupId: null, groupSlot: null, updatedAt: new Date() })
          .where("tournamentId", "=", tournamentId)
          .execute();
        await trx.deleteFrom("tournamentGroups").where("tournamentId", "=", tournamentId).execute();
        await trx
          .updateTable("tournaments")
          .set({ currentRound: 0, updatedAt: new Date() })
          .where("id", "=", tournamentId)
          .execute();
      });
    },

    async clearSeeds(tournamentId: string): Promise<void> {
      await db
        .updateTable("tournamentParticipants")
        .set({ seed: null, updatedAt: new Date() })
        .where("tournamentId", "=", tournamentId)
        .where("seed", "is not", null)
        .execute();
    },

    /** A walkover carries placements and no game points, so game win rate is untouched. */
    async setWalkoverResult(
      podId: string,
      results: { playerId: string; placement: number }[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        for (const { playerId, placement } of results) {
          await trx
            .updateTable("podMembers")
            .set({ placement, gamePoints: null })
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

    async listPendingGroupStagePods(
      tournamentId: string,
      playerId: string,
    ): Promise<PendingGroupPod[]> {
      const podIds = await db
        .selectFrom("pods as p")
        .innerJoin("podRounds as r", "r.id", "p.roundId")
        .innerJoin("podMembers as m", "m.podId", "p.id")
        .select("p.id as podId")
        .where("r.tournamentId", "=", tournamentId)
        .where("r.roundNumber", "<=", GROUP_STAGE_ROUNDS)
        .where("p.resultStatus", "=", "pending")
        .where("m.playerId", "=", playerId)
        .execute();
      if (podIds.length === 0) {
        return [];
      }
      const ids = podIds.map((row) => row.podId);
      const members = await db
        .selectFrom("podMembers as m")
        .innerJoin("tournamentParticipants as pl", "pl.id", "m.playerId")
        .select(["m.podId as podId", "m.playerId as playerId", "pl.status as status"])
        .where("m.podId", "in", ids)
        .orderBy("m.seat", "asc")
        .execute();
      const byPod = Map.groupBy(members, (row) => row.podId);
      return ids.map((podId) => ({
        podId,
        members: (byPod.get(podId) ?? []).map((row) => ({
          playerId: row.playerId,
          status: row.status,
        })),
      }));
    },

    async podCountForRound(tournamentId: string, roundNumber: number): Promise<number> {
      const rows = await db
        .selectFrom("pods as p")
        .innerJoin("podRounds as r", "r.id", "p.roundId")
        .select("p.id as podId")
        .where("r.tournamentId", "=", tournamentId)
        .where("r.roundNumber", "=", roundNumber)
        .execute();
      return rows.length;
    },

    /** Only ids the catalog knows as Legend cards come back; the rest are rejected upstream. */
    async legendCardNames(cardIds: string[]): Promise<Map<string, string>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("id", "in", cardIds)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("cardCardTypes as cct")
              .select("cct.cardId")
              .whereRef("cct.cardId", "=", "cards.id")
              .where("cct.typeSlug", "=", WellKnown.cardType.LEGEND),
          ),
        )
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    async legendCardIdsFromDeckCheck(tournamentId: string): Promise<Map<string, string>> {
      const rows = await db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("deckCheckEntryCards as c", "c.entryId", "en.id")
        .select([
          "en.participantId as participantId",
          "c.resolvedCardId as cardId",
          sql<number>`(row_number() over (
            partition by en.participant_id
            order by en.submitted_at desc nulls last, en.created_at desc, c.sort_order
          ))::int`.as("rank"),
        ])
        .where("en.tournamentId", "=", tournamentId)
        .where("en.withdrawnAt", "is", null)
        .where("c.zone", "=", WellKnown.deckZone.LEGEND)
        .where("c.resolvedCardId", "is not", null)
        .execute();
      const legends = new Map<string, string>();
      for (const row of rows) {
        if (row.rank === 1 && row.participantId && row.cardId) {
          legends.set(row.participantId, row.cardId);
        }
      }
      return legends;
    },

    async setParticipantLegends(
      rows: { participantId: string; legendCardId: string }[],
    ): Promise<void> {
      for (const { participantId, legendCardId } of rows) {
        await db
          .updateTable("tournamentParticipants")
          .set({ legendCardId, updatedAt: new Date() })
          .where("id", "=", participantId)
          .execute();
      }
    },

    async listMetaShares(tournamentId: string): Promise<LegendMetaShareRow[]> {
      const rows = await db
        .selectFrom("tournamentLegendMetaShares as s")
        .leftJoin("cards as c", "c.id", "s.legendCardId")
        .select(["s.legendCardId as legendCardId", "s.share as share", "c.name as legendName"])
        .where("s.tournamentId", "=", tournamentId)
        .execute();
      return rows.map((row) => ({
        legendCardId: row.legendCardId,
        legendName: row.legendName,
        share: Number(row.share),
      }));
    },

    async upsertMetaShares(
      tournamentId: string,
      shares: { legendCardId: string; share: number }[],
    ): Promise<void> {
      if (shares.length === 0) {
        return;
      }
      await db
        .insertInto("tournamentLegendMetaShares")
        .values(shares.map((entry) => ({ tournamentId, ...entry })))
        .onConflict((oc) =>
          oc.columns(["tournamentId", "legendCardId"]).doUpdateSet((eb) => ({
            share: eb.ref("excluded.share"),
          })),
        )
        .execute();
    },
  };
}
