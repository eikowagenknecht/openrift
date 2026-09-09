import type {
  GroupStageGroupView,
  PodMemberResponse,
  PodResponse,
  PodRoundResponse,
} from "@openrift/shared/types/api/pod-tournament";
import { describe, expect, it } from "vitest";

import {
  groupLabelByPlayer,
  groupUnits,
  isCrossGroupPod,
  isWalkoverPod,
  podScoreLine,
  podsOfUnit,
  roundSummaryLine,
  unitReportProgress,
  waitingUnitsLabel,
} from "./group-cut-units";

function makeGroup(
  label: string,
  playerIds: string[],
  overrides: Partial<GroupStageGroupView> = {},
): GroupStageGroupView {
  return {
    id: `g-${label}`,
    label,
    pairedGroupId: null,
    pairedGroupLabel: null,
    playerIds,
    roundsStarted: 1,
    currentRoundReported: false,
    canStartNextRound: false,
    done: false,
    standings: [],
    ...overrides,
  };
}

function makeMember(
  playerId: string,
  overrides: Partial<PodMemberResponse> = {},
): PodMemberResponse {
  return {
    playerId,
    displayName: playerId.toUpperCase(),
    teamId: null,
    gamePoints: null,
    placement: null,
    points: null,
    ...overrides,
  };
}

function makePod(
  id: string,
  podNumber: number,
  members: PodMemberResponse[],
  overrides: Partial<PodResponse> = {},
): PodResponse {
  return {
    id,
    podNumber,
    size: 2,
    resultStatus: "pending",
    members,
    penalty: null,
    ...overrides,
  };
}

function makeRound(roundNumber: number, pods: PodResponse[]): PodRoundResponse {
  return {
    id: `r-${roundNumber}`,
    roundNumber,
    status: "reporting",
    pairingStrategy: "swiss",
    penaltyTotal: null,
    createdAt: "2026-09-09T10:00:00Z",
    finalizedAt: null,
    pods,
    byes: [],
  };
}

describe("groupUnits", () => {
  it("gives a 4-player group its own unit", () => {
    const units = groupUnits([makeGroup("A", ["p1", "p2", "p3", "p4"])]);
    expect(units).toHaveLength(1);
    expect(units[0]?.label).toBe("Group A");
    expect(units[0]?.paired).toBe(false);
    expect(units[0]?.playerIds).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("folds the two paired 3-player groups into one unit", () => {
    const units = groupUnits([
      makeGroup("D", ["p1", "p2", "p3"], { pairedGroupId: "g-E", pairedGroupLabel: "E" }),
      makeGroup("E", ["p4", "p5", "p6"], { pairedGroupId: "g-D", pairedGroupLabel: "D" }),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]?.label).toBe("Group D · E");
    expect(units[0]?.paired).toBe(true);
    expect(units[0]?.playerIds).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("advances a paired unit only when both halves can", () => {
    const [unit] = groupUnits([
      makeGroup("D", ["p1"], {
        pairedGroupId: "g-E",
        pairedGroupLabel: "E",
        canStartNextRound: true,
        roundsStarted: 2,
      }),
      makeGroup("E", ["p2"], {
        pairedGroupId: "g-D",
        pairedGroupLabel: "D",
        canStartNextRound: false,
        roundsStarted: 1,
      }),
    ]);
    expect(unit?.canStartNextRound).toBe(false);
    expect(unit?.roundsStarted).toBe(2);
  });

  it("keeps unpaired groups in their listed order", () => {
    const units = groupUnits([
      makeGroup("A", ["p1"]),
      makeGroup("B", ["p2"]),
      makeGroup("C", ["p3"]),
    ]);
    expect(units.map((unit) => unit.label)).toEqual(["Group A", "Group B", "Group C"]);
  });
});

describe("podsOfUnit", () => {
  it("keeps only the matches its members play", () => {
    const [unit] = groupUnits([makeGroup("A", ["p1", "p2", "p3", "p4"])]);
    const round = makeRound(1, [
      makePod("pod-1", 1, [makeMember("p1"), makeMember("p2")]),
      makePod("pod-2", 2, [makeMember("p3"), makeMember("p4")]),
      makePod("pod-3", 3, [makeMember("p9"), makeMember("p8")]),
    ]);
    expect(podsOfUnit(round, unit!).map((pod) => pod.id)).toEqual(["pod-1", "pod-2"]);
  });
});

describe("isCrossGroupPod", () => {
  const labelByPlayer = groupLabelByPlayer([
    makeGroup("D", ["p1", "p2", "p3"]),
    makeGroup("E", ["p4", "p5", "p6"]),
  ]);

  it("is true when the two players sit in different groups", () => {
    const pod = makePod("x", 1, [makeMember("p1"), makeMember("p4")]);
    expect(isCrossGroupPod(pod, labelByPlayer)).toBe(true);
  });

  it("is false inside one group", () => {
    const pod = makePod("x", 1, [makeMember("p1"), makeMember("p2")]);
    expect(isCrossGroupPod(pod, labelByPlayer)).toBe(false);
  });
});

describe("isWalkoverPod", () => {
  it("is true when placements decide the match and no games were played", () => {
    const pod = makePod("x", 1, [
      makeMember("p1", { placement: 1, gamePoints: null }),
      makeMember("p2", { placement: 2, gamePoints: null }),
    ]);
    expect(isWalkoverPod(pod)).toBe(true);
  });

  it("is false with game points, and false while unreported", () => {
    const played = makePod("x", 1, [
      makeMember("p1", { placement: 1, gamePoints: 2 }),
      makeMember("p2", { placement: 2, gamePoints: 0 }),
    ]);
    expect(isWalkoverPod(played)).toBe(false);
    expect(isWalkoverPod(makePod("y", 1, [makeMember("p1"), makeMember("p2")]))).toBe(false);
  });
});

describe("podScoreLine", () => {
  it("puts the winner first with the game score", () => {
    const pod = makePod("x", 1, [
      makeMember("p2", { displayName: "Braum", placement: 2, gamePoints: 0 }),
      makeMember("p1", { displayName: "Ashe", placement: 1, gamePoints: 2 }),
    ]);
    expect(podScoreLine(pod)).toBe("Ashe 2-0 Braum");
  });

  it("says who beat whom on a walkover", () => {
    const pod = makePod("x", 1, [
      makeMember("p1", { displayName: "Ashe", placement: 1, gamePoints: null }),
      makeMember("p2", { displayName: "Braum", placement: 2, gamePoints: null }),
    ]);
    expect(podScoreLine(pod)).toBe("Ashe def. Braum");
  });

  it("names both when neither played", () => {
    const pod = makePod("x", 1, [
      makeMember("p1", { displayName: "Ashe", placement: 0, gamePoints: null }),
      makeMember("p2", { displayName: "Braum", placement: 0, gamePoints: null }),
    ]);
    expect(podScoreLine(pod)).toBe("Ashe and Braum both forfeited");
  });

  it("reads as a fixture while the match is unreported", () => {
    const pod = makePod("x", 1, [
      makeMember("p1", { displayName: "Ashe" }),
      makeMember("p2", { displayName: "Braum" }),
    ]);
    expect(podScoreLine(pod)).toBe("Ashe vs Braum");
  });
});

describe("roundSummaryLine", () => {
  it("joins the round's matches in pod order", () => {
    const line = roundSummaryLine(1, [
      makePod("b", 2, [
        makeMember("p3", { displayName: "Caitlyn", placement: 1, gamePoints: 2 }),
        makeMember("p4", { displayName: "Darius", placement: 2, gamePoints: 1 }),
      ]),
      makePod("a", 1, [
        makeMember("p1", { displayName: "Ashe", placement: 1, gamePoints: 2 }),
        makeMember("p2", { displayName: "Braum", placement: 2, gamePoints: 0 }),
      ]),
    ]);
    expect(line).toBe("Round 1 · Ashe 2-0 Braum · Caitlyn 2-1 Darius");
  });
});

describe("waitingUnitsLabel", () => {
  it("names each unit still playing with the round it is on", () => {
    const units = groupUnits([
      makeGroup("A", ["p1"], { done: true, roundsStarted: 3 }),
      makeGroup("C", ["p2"], { roundsStarted: 2 }),
      makeGroup("D", ["p3"], {
        pairedGroupId: "g-E",
        pairedGroupLabel: "E",
        roundsStarted: 3,
      }),
      makeGroup("E", ["p4"], {
        pairedGroupId: "g-D",
        pairedGroupLabel: "D",
        roundsStarted: 3,
      }),
    ]);
    expect(waitingUnitsLabel(units)).toBe("Group C (round 2), Group D · E (round 3)");
  });

  it("is null once every group is done", () => {
    const units = groupUnits([makeGroup("A", ["p1"], { done: true })]);
    expect(waitingUnitsLabel(units)).toBeNull();
  });

  it("reads round one for a group that has not started", () => {
    const units = groupUnits([makeGroup("A", ["p1"], { roundsStarted: 0 })]);
    expect(waitingUnitsLabel(units)).toBe("Group A (round 1)");
  });
});

describe("unitReportProgress", () => {
  it("counts the reported matches of the round", () => {
    const pods = [makePod("a", 1, [], { resultStatus: "reported" }), makePod("b", 2, [])];
    expect(unitReportProgress(pods)).toEqual({ reported: 1, total: 2 });
  });
});
