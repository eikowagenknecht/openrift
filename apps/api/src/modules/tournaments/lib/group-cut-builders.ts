import type {
  GroupMatch,
  GroupPlan,
  GroupStageRanking,
  QualificationRow,
} from "@openrift/shared/pairing/group-cut-types";
import { computeGroupStage } from "@openrift/shared/pairing/group-standings";
import type {
  GroupStageView,
  LegendMetaShareView,
} from "@openrift/shared/types/api/pod-tournament";

import type { Repos } from "../../../deps.js";
import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import { tieBreakKey } from "../repositories/pod-tournaments-standings.js";
import type { LegendMetaShareRow, TournamentGroup } from "../repositories/tournament-groups.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import { toGroupStageView, toLegendMetaShares } from "./group-cut-presenters.js";
import type { GroupCutPlayer } from "./group-cut.js";
import {
  groupStageMatches,
  isGroupCut,
  planFromRows,
  qualificationOrder,
  standingsInput,
} from "./group-cut.js";

export interface GroupCutContext {
  groups: TournamentGroup[];
  plan: GroupPlan;
  matches: GroupMatch[];
  ranking: GroupStageRanking;
  qualifiers: QualificationRow[];
  metaShares: LegendMetaShareRow[];
  legendNames: Map<string, string>;
}

export async function loadGroupCutContext(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
  roundRows: readonly PodRoundRows[],
): Promise<GroupCutContext> {
  const [groups, metaShares] = await Promise.all([
    repos.tournamentGroups.listGroups(tournament.id),
    repos.tournamentGroups.listMetaShares(tournament.id),
  ]);
  const legendIds = [
    ...new Set([
      ...players.flatMap((player) => (player.legendCardId === null ? [] : [player.legendCardId])),
      ...metaShares.map((row) => row.legendCardId),
    ]),
  ];
  const legendNames = await repos.tournamentGroups.legendCardNames(legendIds);
  const plan = planFromRows(groups, players);
  const matches = groupStageMatches(roundRows);
  const computed = computeGroupStage(
    standingsInput({ tournament, plan, matches, players, metaShares, tieBreakKey }),
  );
  const { ordered, eligible } = qualificationOrder(computed.ranking, players);
  return {
    groups,
    plan,
    matches,
    ranking: { ...computed, ranking: ordered },
    qualifiers: eligible,
    metaShares,
    legendNames,
  };
}

export interface GroupStageBundle {
  groupStage: GroupStageView | null;
  legendMetaShares: LegendMetaShareView[];
}

/** `rounds` tournaments carry no group stage and no shares. */
export async function buildGroupStageBundle(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
  roundRows: readonly PodRoundRows[],
): Promise<GroupStageBundle> {
  if (!isGroupCut(tournament)) {
    return { groupStage: null, legendMetaShares: [] };
  }
  const context = await loadGroupCutContext(repos, tournament, players, roundRows);
  return {
    groupStage: toGroupStageView({
      tournament,
      groups: context.groups,
      plan: context.plan,
      players,
      roundRows,
      ranking: context.ranking,
      legendNames: context.legendNames,
    }),
    legendMetaShares: toLegendMetaShares(context.metaShares),
  };
}
