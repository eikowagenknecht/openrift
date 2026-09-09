import type { GroupCutPlayer } from "../modules/tournaments/lib/group-cut.js";
import type { PodRoundRows } from "../modules/tournaments/repositories/pod-tournaments-rounds.js";
import type { TournamentGroup } from "../modules/tournaments/repositories/tournament-groups.js";
import type { Tournament } from "../modules/tournaments/repositories/tournaments-shared.js";

export type Outcome = "open" | "first" | "second" | "draw" | "walkover";

const NO_PENALTY = {
  total: 0,
  rematch: 0,
  rematchPairs: 0,
  spread: 0,
  scoreSpread: 0,
  imbalance: 0,
  float: 0,
  threePodRepeat: 0,
  sameRegion: 0,
  repeatedRegion: 0,
};

interface PodSpec {
  podNumber: number;
  playerIds: [string, string];
  outcome: Outcome;
}

export function groupCutTournament(patch: Partial<Tournament> = {}): Tournament {
  return {
    id: "t-1",
    status: "running",
    format: "group_cut",
    pairingStyle: "swiss",
    playMode: "1v1",
    matchFormat: "bo3",
    cutSize: 4,
    cutRematchAvoidance: false,
    legendTiebreak: false,
    groupsSelfPaced: true,
    winPoints: 3,
    drawPoints: 1,
    byePoints: 3,
    currentRound: 3,
    ...patch,
  } as unknown as Tournament;
}

export function groupRow(label: string, pairedLabel: string | null = null): TournamentGroup {
  return {
    id: `g-${label}`,
    tournamentId: "t-1",
    label,
    pairedGroupId: pairedLabel === null ? null : `g-${pairedLabel}`,
  } as TournamentGroup;
}

export function playerRow(
  id: string,
  label: string,
  slot: number,
  patch: Partial<GroupCutPlayer> = {},
): GroupCutPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    status: "active",
    groupId: `g-${label}`,
    groupSlot: slot,
    legendCardId: null,
    seed: null,
    ...patch,
  };
}

function idOf(label: string, slot: number): string {
  return `${label.toLowerCase()}${slot + 1}`;
}

/** Group "A" holds a1..a4 in slot order. */
export function groupPlayers(label: string, size: 3 | 4): GroupCutPlayer[] {
  return Array.from({ length: size }, (_, slot) => playerRow(idOf(label, slot), label, slot));
}

const FOUR_TABLES: Record<number, [number, number][]> = {
  1: [
    [0, 1],
    [2, 3],
  ],
  2: [
    [0, 2],
    [1, 3],
  ],
  3: [
    [0, 3],
    [1, 2],
  ],
};

export function fourGroupPairs(label: string, round: number): [string, string][] {
  return (FOUR_TABLES[round] ?? []).map(
    ([a, b]) => [idOf(label, a), idOf(label, b)] satisfies [string, string],
  );
}

/** Cross-group pair first, then each group's remaining pair, the order `unitRoundPairs` uses. */
export function pairedGroupPairs(first: string, second: string, round: number): [string, string][] {
  const cross = round - 1;
  const [restA, restB] = [0, 1, 2].filter((slot) => slot !== cross) as [number, number];
  return [
    [idOf(first, cross), idOf(second, cross)],
    [idOf(first, restA), idOf(first, restB)],
    [idOf(second, restA), idOf(second, restB)],
  ];
}

const PLACEMENTS: Record<Outcome, [number | null, number | null]> = {
  open: [null, null],
  first: [1, 2],
  second: [2, 1],
  draw: [1, 1],
  walkover: [2, 1],
};

/** A walkover carries no games, so it never moves a game win rate. */
const GAME_POINTS: Record<Outcome, [number | null, number | null]> = {
  open: [null, null],
  first: [2, 0],
  second: [0, 2],
  draw: [1, 1],
  walkover: [null, null],
};

function podMembers(podId: string, playerIds: [string, string], outcome: Outcome) {
  return playerIds.map((playerId, seat) => ({
    podId,
    playerId,
    displayName: playerId.toUpperCase(),
    teamId: null,
    placement: PLACEMENTS[outcome][seat] ?? null,
    gamePoints: GAME_POINTS[outcome][seat] ?? null,
  }));
}

export function roundRows(
  roundNumber: number,
  pods: PodSpec[],
  status: "reporting" | "finalized" = "reporting",
): PodRoundRows {
  return {
    round: {
      id: `r-${roundNumber}`,
      tournamentId: "t-1",
      roundNumber,
      status,
      penaltyTotal: 0,
      pairingStrategy: roundNumber > 3 ? "cut" : "group_stage",
      createdAt: new Date("2026-09-09T00:00:00.000Z"),
      finalizedAt: status === "finalized" ? new Date("2026-09-09T01:00:00.000Z") : null,
    },
    pods: pods.map((spec) => ({
      pod: {
        id: `p-${roundNumber}-${spec.podNumber}`,
        roundId: `r-${roundNumber}`,
        podNumber: spec.podNumber,
        size: 2,
        resultStatus: spec.outcome === "open" ? "pending" : "reported",
        penaltyBreakdown: NO_PENALTY,
      },
      members: podMembers(`p-${roundNumber}-${spec.podNumber}`, spec.playerIds, spec.outcome),
    })),
    byes: [],
  } as unknown as PodRoundRows;
}

export interface UnitPlan {
  /** One label is a 4-player group, two are the paired 3-player groups. */
  labels: [string] | [string, string];
  /** One outcome per started round, applied to every pod of that round. */
  rounds: Outcome[];
}

/** Rounds 1..3 with each unit's pods in its own pod-number block, as the service writes them. */
export function groupStageRoundRows(units: UnitPlan[]): PodRoundRows[] {
  const byRound = new Map<number, PodSpec[]>([
    [1, []],
    [2, []],
    [3, []],
  ]);
  let offset = 0;
  for (const unit of units) {
    const [first, second] = unit.labels;
    const base = offset;
    for (const [index, outcome] of unit.rounds.entries()) {
      const round = index + 1;
      const pairs =
        second === undefined
          ? fourGroupPairs(first, round)
          : pairedGroupPairs(first, second, round);
      const specs: PodSpec[] = [];
      for (const [position, playerIds] of pairs.entries()) {
        specs.push({ podNumber: base + position + 1, playerIds, outcome });
      }
      byRound.get(round)?.push(...specs);
    }
    offset += second === undefined ? 2 : 3;
  }
  return [1, 2, 3].map((round) => roundRows(round, byRound.get(round) ?? []));
}
