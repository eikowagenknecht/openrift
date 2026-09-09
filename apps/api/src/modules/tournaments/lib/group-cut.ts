import type {
  GroupMatch,
  GroupPlan,
  GroupPlanGroup,
  GroupStandingsInput,
} from "@openrift/shared/pairing/group-cut-types";
import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";

import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { GroupPodInsert, TournamentGroup } from "../repositories/tournament-groups.js";
import type { Tournament } from "../repositories/tournaments-shared.js";

export type GroupStageRoundNumber = 1 | 2 | 3;

export interface GroupCutPlayer {
  id: string;
  displayName: string;
  status: string;
  groupId: string | null;
  groupSlot: number | null;
  legendCardId: string | null;
  seed: number | null;
}

export interface UnitProgress {
  roundsStarted: number;
  currentRoundReported: boolean;
}

export function isGroupCut(tournament: Tournament): boolean {
  return tournament.format === "group_cut";
}

export function isGroupStageRound(roundNumber: number): boolean {
  return roundNumber <= GROUP_STAGE_ROUNDS;
}

export function groupStageRounds(roundRows: readonly PodRoundRows[]): PodRoundRows[] {
  return roundRows.filter((rows) => isGroupStageRound(rows.round.roundNumber));
}

export function cutRounds(roundRows: readonly PodRoundRows[]): PodRoundRows[] {
  return roundRows
    .filter((rows) => !isGroupStageRound(rows.round.roundNumber))
    .toSorted((a, b) => a.round.roundNumber - b.round.roundNumber);
}

export function highestRoundNumber(roundRows: readonly PodRoundRows[]): number {
  return roundRows.reduce((highest, rows) => Math.max(highest, rows.round.roundNumber), 0);
}

/**
 * Label order is the plan order: a later round's pod numbers must match the
 * order round 1 was generated with.
 */
export function planFromRows(
  groups: readonly TournamentGroup[],
  players: readonly GroupCutPlayer[],
): GroupPlan {
  const labelById = new Map(groups.map((group) => [group.id, group.label]));
  // Labels run A..Z then AA, so length sorts before the letters.
  const ordered = groups.toSorted(
    (a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label),
  );
  return {
    groups: ordered.map((group) => ({
      label: group.label,
      playerIds: players
        .filter((player) => player.groupId === group.id)
        .toSorted((a, b) => (a.groupSlot ?? 0) - (b.groupSlot ?? 0))
        .map((player) => player.id),
      pairedWith:
        group.pairedGroupId === null ? null : (labelById.get(group.pairedGroupId) ?? null),
    })),
  };
}

/** Pods before each unit in a round, so self-paced starts never collide on a pod number. */
export function unitPodOffsets(units: readonly (readonly GroupPlanGroup[])[]): number[] {
  const offsets: number[] = [];
  let taken = 0;
  for (const unit of units) {
    offsets.push(taken);
    taken += unit.reduce((count, group) => count + group.playerIds.length, 0) / 2;
  }
  return offsets;
}

export function unitPlayerIds(unit: readonly GroupPlanGroup[]): Set<string> {
  return new Set(unit.flatMap((group) => group.playerIds));
}

/** A dropped player forfeits; two dropped players draw. Placements follow pair order. */
export function walkoverPlacements(
  pair: readonly [string, string],
  droppedIds: ReadonlySet<string>,
): [number, number] | null {
  const firstOut = droppedIds.has(pair[0]);
  const secondOut = droppedIds.has(pair[1]);
  if (!firstOut && !secondOut) {
    return null;
  }
  if (firstOut && secondOut) {
    return [1, 1];
  }
  return firstOut ? [2, 1] : [1, 2];
}

export function podInsertsForPairs(
  pairs: readonly { pair: [string, string] }[],
  podNumberBase: number,
  droppedIds: ReadonlySet<string>,
): GroupPodInsert[] {
  return pairs.map((entry, index) => ({
    podNumber: podNumberBase + index + 1,
    playerIds: entry.pair,
    placements: walkoverPlacements(entry.pair, droppedIds),
  }));
}

/** A pod belongs to a unit when both of its members do. */
function podsOfUnit(rows: PodRoundRows, memberIds: ReadonlySet<string>) {
  return rows.pods.filter((entry) =>
    entry.members.every((member) => memberIds.has(member.playerId)),
  );
}

export function unitProgress(
  memberIds: ReadonlySet<string>,
  roundRows: readonly PodRoundRows[],
): UnitProgress {
  const stage = groupStageRounds(roundRows).toSorted(
    (a, b) => a.round.roundNumber - b.round.roundNumber,
  );
  let roundsStarted = 0;
  let latest: PodRoundRows | undefined;
  for (const rows of stage) {
    if (podsOfUnit(rows, memberIds).length > 0) {
      roundsStarted += 1;
      latest = rows;
    }
  }
  const currentRoundReported =
    latest !== undefined &&
    podsOfUnit(latest, memberIds).every((entry) => entry.pod.resultStatus === "reported");
  return { roundsStarted, currentRoundReported };
}

export function groupStageMatches(roundRows: readonly PodRoundRows[]): GroupMatch[] {
  return groupStageRounds(roundRows).flatMap((rows) =>
    rows.pods.flatMap((entry) => {
      const [first, second] = entry.members;
      if (!first || !second) {
        return [];
      }
      const reported =
        entry.pod.resultStatus === "reported" &&
        first.placement !== null &&
        second.placement !== null;
      return [
        {
          playerIds: [first.playerId, second.playerId] as [string, string],
          placements: reported ? ([first.placement, second.placement] as [number, number]) : null,
          gamePoints: [first.gamePoints, second.gamePoints] as [number | null, number | null],
        },
      ];
    }),
  );
}

/** Group-stage opponents per player, the cross-group match included. */
export function opponentsByPlayer(matches: readonly GroupMatch[]): Map<string, string[]> {
  const opponents = new Map<string, string[]>();
  const add = (playerId: string, opponentId: string): void => {
    const existing = opponents.get(playerId);
    if (existing) {
      existing.push(opponentId);
    } else {
      opponents.set(playerId, [opponentId]);
    }
  };
  for (const match of matches) {
    add(match.playerIds[0], match.playerIds[1]);
    add(match.playerIds[1], match.playerIds[0]);
  }
  return opponents;
}

export function standingsInput(input: {
  tournament: Tournament;
  plan: GroupPlan;
  matches: GroupMatch[];
  players: readonly GroupCutPlayer[];
  metaShares: readonly { legendCardId: string; share: number }[];
  tieBreakKey: (playerId: string) => number;
}): GroupStandingsInput {
  return {
    groups: input.plan.groups,
    matches: input.matches,
    winPoints: input.tournament.winPoints,
    drawPoints: input.tournament.drawPoints,
    legend: input.tournament.legendTiebreak
      ? {
          legendByPlayer: new Map(input.players.map((player) => [player.id, player.legendCardId])),
          metaShareByLegend: new Map(
            input.metaShares.map((entry) => [entry.legendCardId, entry.share]),
          ),
        }
      : null,
    tieBreakKey: input.tieBreakKey,
  };
}

/** The pod's winner: lowest placement, seat order breaking an equal one. */
export function podWinnerId(members: readonly { playerId: string; placement: number | null }[]) {
  const ranked = members.toSorted(
    (a, b) => (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER),
  );
  return ranked[0]?.playerId;
}
