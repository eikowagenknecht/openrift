import { groupUnits } from "@openrift/shared/pairing/group-stage";
import { describe, expect, it } from "vitest";

import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { TournamentGroup } from "../repositories/tournament-groups.js";
import type { GroupCutPlayer } from "./group-cut.js";
import {
  groupStageMatches,
  opponentsByPlayer,
  planFromRows,
  podInsertsForPairs,
  podWinnerId,
  unitPlayerIds,
  unitPodOffsets,
  unitProgress,
  walkoverPlacements,
} from "./group-cut.js";

function group(label: string, pairedGroupId: string | null = null): TournamentGroup {
  return { id: `g-${label}`, tournamentId: "t-1", label, pairedGroupId };
}

function player(id: string, groupLabel: string | null, groupSlot: number | null): GroupCutPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    status: "active",
    groupId: groupLabel === null ? null : `g-${groupLabel}`,
    groupSlot,
    legendCardId: null,
    seed: null,
  };
}

function round(
  roundNumber: number,
  pods: { podNumber: number; playerIds: string[]; reported: boolean }[],
): PodRoundRows {
  return {
    round: {
      id: `r-${roundNumber}`,
      tournamentId: "t-1",
      roundNumber,
      status: "reporting",
      penaltyTotal: 0,
      pairingStrategy: "group_stage",
      createdAt: new Date("2026-09-09T00:00:00.000Z"),
      finalizedAt: null,
    },
    pods: pods.map((entry) => ({
      pod: {
        id: `p-${roundNumber}-${entry.podNumber}`,
        roundId: `r-${roundNumber}`,
        podNumber: entry.podNumber,
        size: 2,
        resultStatus: entry.reported ? "reported" : "pending",
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
      members: entry.playerIds.map((playerId, seat) => ({
        podId: `p-${roundNumber}-${entry.podNumber}`,
        playerId,
        displayName: playerId.toUpperCase(),
        teamId: null,
        placement: entry.reported ? seat + 1 : null,
        gamePoints: entry.reported ? 1 - seat : null,
      })),
    })),
    byes: [],
  };
}

describe("planFromRows", () => {
  it("orders groups by label and players by slot, resolving the paired label", () => {
    const groups = [group("B", "g-C"), group("C", "g-B"), group("A")];
    const players = [
      player("a4", "A", 3),
      player("a1", "A", 0),
      player("b1", "B", 0),
      player("a2", "A", 1),
      player("a3", "A", 2),
      player("c1", "C", 0),
    ];
    const plan = planFromRows(groups, players);
    expect(plan.groups.map((entry) => entry.label)).toEqual(["A", "B", "C"]);
    expect(plan.groups[0]?.playerIds).toEqual(["a1", "a2", "a3", "a4"]);
    expect(plan.groups[1]?.pairedWith).toBe("C");
    expect(plan.groups[2]?.pairedWith).toBe("B");
  });

  it("keeps the generated order past group Z", () => {
    const labels = ["A", "AA", "Z"];
    const plan = planFromRows(
      labels.map((label) => group(label)),
      [],
    );
    expect(plan.groups.map((entry) => entry.label)).toEqual(["A", "Z", "AA"]);
  });
});

describe("unitPodOffsets", () => {
  it("blocks pod numbers per unit so self-paced starts never collide", () => {
    const plan = planFromRows(
      [group("A"), group("B"), group("C", "g-D"), group("D", "g-C")],
      [
        ...["a1", "a2", "a3", "a4"].map((id, slot) => player(id, "A", slot)),
        ...["b1", "b2", "b3", "b4"].map((id, slot) => player(id, "B", slot)),
        ...["c1", "c2", "c3"].map((id, slot) => player(id, "C", slot)),
        ...["d1", "d2", "d3"].map((id, slot) => player(id, "D", slot)),
      ],
    );
    expect(unitPodOffsets(groupUnits(plan))).toEqual([0, 2, 4]);
  });
});

describe("walkoverPlacements", () => {
  it("leaves a pod of two active players pending", () => {
    expect(walkoverPlacements(["a", "b"], new Set())).toBeNull();
  });

  it("gives the win to the player who is still in", () => {
    expect(walkoverPlacements(["a", "b"], new Set(["a"]))).toEqual([2, 1]);
    expect(walkoverPlacements(["a", "b"], new Set(["b"]))).toEqual([1, 2]);
  });

  it("draws when both players dropped", () => {
    expect(walkoverPlacements(["a", "b"], new Set(["a", "b"]))).toEqual([1, 1]);
  });
});

describe("podInsertsForPairs", () => {
  it("numbers pods from the unit's block and reports the walkovers at once", () => {
    const inserts = podInsertsForPairs(
      [{ pair: ["a", "b"] }, { pair: ["c", "d"] }],
      4,
      new Set(["c"]),
    );
    expect(inserts).toEqual([
      { podNumber: 5, playerIds: ["a", "b"], placements: null },
      { podNumber: 6, playerIds: ["c", "d"], placements: [2, 1] },
    ]);
  });
});

describe("unitProgress", () => {
  const memberIds = new Set(["a1", "a2", "a3", "a4"]);

  it("counts only the rounds the unit has pods in", () => {
    const rows = [
      round(1, [
        { podNumber: 1, playerIds: ["a1", "a2"], reported: true },
        { podNumber: 2, playerIds: ["a3", "a4"], reported: true },
        { podNumber: 3, playerIds: ["b1", "b2"], reported: false },
      ]),
      round(2, [{ podNumber: 3, playerIds: ["b1", "b3"], reported: false }]),
    ];
    expect(unitProgress(memberIds, rows)).toEqual({
      roundsStarted: 1,
      currentRoundReported: true,
    });
  });

  it("holds the unit back while one of its matches is open", () => {
    const rows = [
      round(1, [
        { podNumber: 1, playerIds: ["a1", "a2"], reported: true },
        { podNumber: 2, playerIds: ["a3", "a4"], reported: false },
      ]),
    ];
    expect(unitProgress(memberIds, rows).currentRoundReported).toBe(false);
  });

  it("ignores the cut rounds", () => {
    const rows = [
      round(1, [{ podNumber: 1, playerIds: ["a1", "a2"], reported: true }]),
      round(4, [{ podNumber: 1, playerIds: ["a1", "a3"], reported: false }]),
    ];
    expect(unitProgress(memberIds, rows).roundsStarted).toBe(1);
  });
});

describe("groupStageMatches", () => {
  it("takes placements only from a reported pod and keeps null game points", () => {
    const rows = [
      round(1, [
        { podNumber: 1, playerIds: ["a", "b"], reported: true },
        { podNumber: 2, playerIds: ["c", "d"], reported: false },
      ]),
      round(4, [{ podNumber: 1, playerIds: ["a", "c"], reported: true }]),
    ];
    const matches = groupStageMatches(rows);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      playerIds: ["a", "b"],
      placements: [1, 2],
      gamePoints: [1, 0],
    });
    expect(matches[1]?.placements).toBeNull();
  });
});

describe("opponentsByPlayer", () => {
  it("maps both sides of every match", () => {
    const opponents = opponentsByPlayer([
      { playerIds: ["a", "b"], placements: null, gamePoints: [null, null] },
      { playerIds: ["a", "c"], placements: null, gamePoints: [null, null] },
    ]);
    expect(opponents.get("a")).toEqual(["b", "c"]);
    expect(opponents.get("b")).toEqual(["a"]);
  });
});

describe("podWinnerId", () => {
  it("takes the lowest placement and falls back to seat order on a tie", () => {
    expect(
      podWinnerId([
        { playerId: "a", placement: 2 },
        { playerId: "b", placement: 1 },
      ]),
    ).toBe("b");
    expect(
      podWinnerId([
        { playerId: "a", placement: 1 },
        { playerId: "b", placement: 1 },
      ]),
    ).toBe("a");
  });
});

describe("unitPlayerIds", () => {
  it("pools both groups of a paired unit", () => {
    const plan = planFromRows(
      [group("A", "g-B"), group("B", "g-A")],
      [
        ...["a1", "a2", "a3"].map((id, slot) => player(id, "A", slot)),
        ...["b1", "b2", "b3"].map((id, slot) => player(id, "B", slot)),
      ],
    );
    expect(unitPlayerIds(groupUnits(plan)[0] ?? [])).toEqual(
      new Set(["a1", "a2", "a3", "b1", "b2", "b3"]),
    );
  });
});
