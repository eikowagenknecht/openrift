import type { GroupPlan, GroupStageRanking } from "@openrift/shared/pairing/group-cut-types";
import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import { groupUnits } from "@openrift/shared/pairing/group-stage";
import type {
  GroupStageGroupView,
  GroupStageView,
  LegendMetaShareView,
  PodPlayerStatus,
} from "@openrift/shared/types/api/pod-tournament";

import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { LegendMetaShareRow, TournamentGroup } from "../repositories/tournament-groups.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import type { GroupCutPlayer } from "./group-cut.js";
import { cutRounds, unitPlayerIds, unitProgress } from "./group-cut.js";

export interface GroupStageViewInput {
  tournament: Tournament;
  groups: readonly TournamentGroup[];
  plan: GroupPlan;
  players: readonly GroupCutPlayer[];
  roundRows: readonly PodRoundRows[];
  ranking: GroupStageRanking;
  legendNames: ReadonlyMap<string, string>;
}

export function toLegendMetaShares(rows: readonly LegendMetaShareRow[]): LegendMetaShareView[] {
  return rows.map((row) => ({
    legendCardId: row.legendCardId,
    legendName: row.legendName,
    share: row.share,
  }));
}

export function toGroupStageView(input: GroupStageViewInput): GroupStageView {
  const { tournament, players, roundRows, ranking } = input;
  const playerById = new Map(players.map((player) => [player.id, player]));
  const groupByLabel = new Map(input.groups.map((group) => [group.label, group]));
  const standingsByLabel = new Map(ranking.groups.map((group) => [group.label, group.rows]));
  const running = tournament.status !== "completed" && tournament.status !== "cancelled";
  const nameOf = (legendCardId: string | null): string | null =>
    legendCardId === null ? null : (input.legendNames.get(legendCardId) ?? null);

  const groups: GroupStageGroupView[] = [];
  let stageComplete = input.groups.length > 0;
  for (const unit of groupUnits(input.plan)) {
    const progress = unitProgress(unitPlayerIds(unit), roundRows);
    const done = progress.roundsStarted === GROUP_STAGE_ROUNDS && progress.currentRoundReported;
    if (!done) {
      stageComplete = false;
    }
    for (const planGroup of unit) {
      const row = groupByLabel.get(planGroup.label);
      if (!row) {
        continue;
      }
      const paired =
        planGroup.pairedWith === null ? undefined : groupByLabel.get(planGroup.pairedWith);
      groups.push({
        id: row.id,
        label: row.label,
        pairedGroupId: paired?.id ?? null,
        pairedGroupLabel: paired?.label ?? null,
        playerIds: planGroup.playerIds,
        roundsStarted: progress.roundsStarted,
        currentRoundReported: progress.currentRoundReported,
        canStartNextRound:
          running && progress.currentRoundReported && progress.roundsStarted < GROUP_STAGE_ROUNDS,
        done,
        standings: (standingsByLabel.get(planGroup.label) ?? []).map((standing) => {
          const player = playerById.get(standing.playerId);
          return {
            playerId: standing.playerId,
            displayName: player?.displayName ?? "",
            status: (player?.status ?? "active") as PodPlayerStatus,
            legendCardId: player?.legendCardId ?? null,
            legendName: nameOf(player?.legendCardId ?? null),
            place: standing.place,
            points: standing.points,
            wins: standing.wins,
            losses: standing.losses,
            draws: standing.draws,
            gamesWon: standing.gamesWon,
            gamesPlayed: standing.gamesPlayed,
            gameWinRate: standing.gameWinRate,
            decidedBy: standing.decidedBy,
          };
        }),
      });
    }
  }

  const cutGenerated = cutRounds(roundRows).length > 0;
  const seedByPlayer = new Map(
    players.flatMap((player) => (player.seed === null ? [] : [[player.id, player.seed] as const])),
  );
  const derived = ranking.ranking.slice(0, tournament.cutSize).map((row) => row.playerId);
  const seeded = [...seedByPlayer.entries()]
    .toSorted((a, b) => a[1] - b[1])
    .map(([playerId]) => playerId);

  return {
    groups,
    ranking: ranking.ranking.map((row, index) => {
      const stored = seedByPlayer.get(row.playerId) ?? null;
      const provisional = index < tournament.cutSize ? index + 1 : null;
      return {
        playerId: row.playerId,
        displayName: playerById.get(row.playerId)?.displayName ?? "",
        groupLabel: row.groupLabel,
        place: row.place,
        matchWinRate: row.matchWinRate,
        gameWinRate: row.gameWinRate,
        decidedBy: row.decidedBy,
        seed: cutGenerated ? stored : provisional,
        qualified: cutGenerated ? stored !== null : provisional !== null,
      };
    }),
    pendingMetaShares: ranking.pendingMetaLegendIds.map((legendCardId) => ({
      legendCardId,
      legendName: nameOf(legendCardId),
    })),
    stageComplete,
    cutGenerated,
    seedsDiverged:
      cutGenerated &&
      (seeded.length !== derived.length ||
        seeded.some((playerId, index) => playerId !== derived[index])),
  };
}
