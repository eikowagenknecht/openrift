import type { GroupStageRanking } from "@openrift/shared/pairing/group-cut-types";
import { describe, expect, it } from "vitest";

import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { TournamentGroup } from "../repositories/tournament-groups.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import { toGroupStageView, toLegendMetaShares } from "./group-cut-presenters.js";
import type { GroupCutPlayer } from "./group-cut.js";
import { planFromRows } from "./group-cut.js";

const GROUPS: TournamentGroup[] = [
  { id: "g-A", tournamentId: "t-1", label: "A", pairedGroupId: null },
  { id: "g-B", tournamentId: "t-1", label: "B", pairedGroupId: null },
];

const PLAYER_IDS = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];

function players(overrides: Partial<Record<string, Partial<GroupCutPlayer>>> = {}) {
  return PLAYER_IDS.map((id, index) => ({
    id,
    displayName: id.toUpperCase(),
    status: "active",
    groupId: index < 4 ? "g-A" : "g-B",
    groupSlot: index % 4,
    legendCardId: null,
    seed: null,
    ...overrides[id],
  })) satisfies GroupCutPlayer[];
}

function tournament(patch: Partial<Tournament> = {}): Tournament {
  return {
    id: "t-1",
    status: "running",
    cutSize: 4,
    legendTiebreak: false,
    format: "group_cut",
    ...patch,
  } as Tournament;
}

function round(roundNumber: number, pods: [string, string][], reported: boolean): PodRoundRows {
  return {
    round: {
      id: `r-${roundNumber}`,
      tournamentId: "t-1",
      roundNumber,
      status: "reporting",
      penaltyTotal: 0,
      pairingStrategy: roundNumber > 3 ? "cut" : "group_stage",
      createdAt: new Date("2026-09-09T00:00:00.000Z"),
      finalizedAt: null,
    },
    pods: pods.map((playerIds, index) => ({
      pod: {
        id: `p-${roundNumber}-${index}`,
        roundId: `r-${roundNumber}`,
        podNumber: index + 1,
        size: 2,
        resultStatus: reported ? "reported" : "pending",
        penaltyBreakdown: {
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
        },
      },
      members: playerIds.map((playerId, seat) => ({
        podId: `p-${roundNumber}-${index}`,
        playerId,
        displayName: playerId.toUpperCase(),
        teamId: null,
        placement: reported ? seat + 1 : null,
        gamePoints: reported ? 1 - seat : null,
      })),
    })),
    byes: [],
  };
}

function ranking(order: string[]): GroupStageRanking {
  return {
    groups: [
      {
        label: "A",
        rows: order
          .filter((id) => id.startsWith("a"))
          .map((playerId, index) => ({
            playerId,
            place: index + 1,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            gamesWon: 0,
            gamesPlayed: 0,
            gameWinRate: null,
            decidedBy: index === 0 ? null : "gw",
          })),
      },
    ],
    ranking: order.map((playerId, index) => ({
      playerId,
      groupLabel: playerId.startsWith("a") ? "A" : "B",
      place: index < 2 ? 1 : 2,
      matchWinRate: 1 - index / 10,
      gameWinRate: null,
      decidedBy: null,
    })),
    pendingMetaLegendIds: [],
  };
}

const ORDER = ["a1", "b1", "a2", "b2", "a3", "b3", "a4", "b4"];

describe("toGroupStageView", () => {
  it("reports per-group progress and provisional seeds before the cut", () => {
    const roster = players();
    const rows = [
      round(
        1,
        [
          ["a1", "a2"],
          ["a3", "a4"],
        ],
        true,
      ),
      round(1, [], true),
    ].slice(0, 1);
    const view = toGroupStageView({
      tournament: tournament(),
      groups: GROUPS,
      plan: planFromRows(GROUPS, roster),
      players: roster,
      roundRows: rows,
      ranking: ranking(ORDER),
      legendNames: new Map(),
    });
    const groupA = view.groups.find((entry) => entry.label === "A");
    expect(groupA?.roundsStarted).toBe(1);
    expect(groupA?.currentRoundReported).toBe(true);
    expect(groupA?.canStartNextRound).toBe(true);
    expect(groupA?.done).toBe(false);
    expect(groupA?.playerIds).toEqual(["a1", "a2", "a3", "a4"]);
    // Group B has no pods yet, so the stage is not complete.
    expect(view.stageComplete).toBe(false);
    expect(view.cutGenerated).toBe(false);
    expect(view.ranking.slice(0, 4).map((row) => row.seed)).toEqual([1, 2, 3, 4]);
    expect(view.ranking.at(-1)?.seed).toBeNull();
    expect(view.ranking.at(-1)?.qualified).toBe(false);
  });

  it("switches to the stored seeds once the cut exists and flags a divergence", () => {
    const roster = players({
      a1: { seed: 1 },
      b1: { seed: 2 },
      a2: { seed: 3 },
      b3: { seed: 4 },
    });
    const rows = [
      round(
        4,
        [
          ["a1", "b3"],
          ["a2", "b1"],
        ],
        false,
      ),
    ];
    const view = toGroupStageView({
      tournament: tournament(),
      groups: GROUPS,
      plan: planFromRows(GROUPS, roster),
      players: roster,
      roundRows: rows,
      ranking: ranking(ORDER),
      legendNames: new Map(),
    });
    expect(view.cutGenerated).toBe(true);
    expect(view.ranking.map((row) => row.seed).slice(0, 4)).toEqual([1, 2, 3, null]);
    expect(view.ranking.find((row) => row.playerId === "b2")?.qualified).toBe(false);
    // The derived top 4 ends on b2, the stored seeds on b3.
    expect(view.seedsDiverged).toBe(true);
  });

  it("names the Legends a reached tie is waiting on", () => {
    const roster = players({ a1: { legendCardId: "card-1" } });
    const view = toGroupStageView({
      tournament: tournament(),
      groups: GROUPS,
      plan: planFromRows(GROUPS, roster),
      players: roster,
      roundRows: [],
      ranking: { ...ranking(ORDER), pendingMetaLegendIds: ["card-1"] },
      legendNames: new Map([["card-1", "Jinx"]]),
    });
    expect(view.pendingMetaShares).toEqual([{ legendCardId: "card-1", legendName: "Jinx" }]);
    const standingA1 = view.groups
      .find((entry) => entry.label === "A")
      ?.standings.find((row) => row.playerId === "a1");
    expect(standingA1?.legendName).toBe("Jinx");
    expect(standingA1?.displayName).toBe("A1");
  });

  it("stops offering the next round on a completed tournament", () => {
    const roster = players();
    const view = toGroupStageView({
      tournament: tournament({ status: "completed" }),
      groups: GROUPS,
      plan: planFromRows(GROUPS, roster),
      players: roster,
      roundRows: [
        round(
          1,
          [
            ["a1", "a2"],
            ["a3", "a4"],
          ],
          true,
        ),
      ],
      ranking: ranking(ORDER),
      legendNames: new Map(),
    });
    expect(view.groups.every((entry) => !entry.canStartNextRound)).toBe(true);
  });
});

describe("toLegendMetaShares", () => {
  it("passes the organizer's values through with their card names", () => {
    expect(
      toLegendMetaShares([{ legendCardId: "card-1", legendName: "Jinx", share: 12.5 }]),
    ).toEqual([{ legendCardId: "card-1", legendName: "Jinx", share: 12.5 }]);
  });
});
