import { describe, expect, it } from "vitest";

import type { PairingPlayer, Pod } from "./types";
import { computePairingWarnings } from "./warnings";

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, byes: 0, opponents: new Map(), ...overrides };
}

function fourPod(...ids: string[]): Pod {
  return { size: 4, playerIds: ids };
}

function threePod(...ids: string[]): Pod {
  return { size: 3, playerIds: ids };
}

function match(...ids: string[]): Pod {
  return { size: 2, playerIds: ids };
}

describe("computePairingWarnings", () => {
  it("returns no warnings for a clean pairing", () => {
    const players = ["a", "b", "c", "d"].map((id) => player(id));
    const warnings = computePairingWarnings([fourPod("a", "b", "c", "d")], players);
    expect(warnings).toEqual([]);
  });

  it("flags each in-pod pair that has met before, with the meeting count", () => {
    const players = [
      player("a", { opponents: new Map([["b", 2]]) }),
      player("b", { opponents: new Map([["a", 2]]) }),
      player("c", {}),
      player("d", {}),
    ];
    const warnings = computePairingWarnings([fourPod("a", "b", "c", "d")], players);
    expect(warnings).toEqual([
      { kind: "rematch", podIndex: 0, playerIds: ["a", "b"], meetings: 2 },
    ]);
  });

  it("flags a large score spread at the threshold", () => {
    const atThreshold = [
      player("a", { score: 6 }),
      player("b", { score: 0 }),
      player("c", { score: 3 }),
      player("d", { score: 3 }),
    ];
    expect(computePairingWarnings([fourPod("a", "b", "c", "d")], atThreshold)).toContainEqual({
      kind: "largeSpread",
      podIndex: 0,
      spread: 6,
    });

    const belowThreshold = [
      player("a", { score: 5 }),
      player("b", { score: 0 }),
      player("c", { score: 3 }),
      player("d", { score: 3 }),
    ];
    expect(
      computePairingWarnings([fourPod("a", "b", "c", "d")], belowThreshold).filter(
        (warning) => warning.kind === "largeSpread",
      ),
    ).toEqual([]);
  });

  it("flags players in a 3-pod who have already been in one, but not in a 4-pod", () => {
    const players = [
      player("a", { pods3: 2 }),
      player("b", { pods3: 0 }),
      player("c", { pods3: 1 }),
    ];
    const warnings = computePairingWarnings([threePod("a", "b", "c")], players);
    expect(warnings).toEqual([
      { kind: "repeatedThreePod", podIndex: 0, playerId: "a", priorThreePods: 2 },
      { kind: "repeatedThreePod", podIndex: 0, playerId: "c", priorThreePods: 1 },
    ]);

    // The same players in a 4-pod raise no repeated-3-pod warning.
    const fourPodPlayers = [...players, player("d", { pods3: 3 })];
    expect(
      computePairingWarnings([fourPod("a", "b", "c", "d")], fourPodPlayers).filter(
        (warning) => warning.kind === "repeatedThreePod",
      ),
    ).toEqual([]);
  });

  it("flags each in-pod pair sharing a region, with the region slug", () => {
    const players = [
      player("a", { region: "noxus" }),
      player("b", { region: "noxus" }),
      player("c", { region: "demacia" }),
      player("d", { region: null }),
    ];
    const warnings = computePairingWarnings([fourPod("a", "b", "c", "d")], players);
    expect(warnings).toEqual([
      { kind: "sameRegion", podIndex: 0, playerIds: ["a", "b"], region: "noxus" },
    ]);
  });

  it("raises no region warning for players without a region", () => {
    const players = [player("a", { region: null }), player("b")];
    const warnings = computePairingWarnings([{ size: 2, playerIds: ["a", "b"] }], players);
    expect(warnings).toEqual([]);
  });

  it("flags a repeat bye only for players who have byed before", () => {
    const players = [player("x", { byes: 1 }), player("y", { byes: 0 })];
    const warnings = computePairingWarnings([], players, ["x", "y"]);
    expect(warnings).toEqual([{ kind: "repeatBye", playerId: "x", priorByes: 1 }]);
  });

  it("reports the pod index for each pod", () => {
    const players = [
      player("a", { opponents: new Map([["b", 1]]) }),
      player("b", { opponents: new Map([["a", 1]]) }),
      player("c"),
      player("d", { opponents: new Map([["e", 1]]) }),
      player("e", { opponents: new Map([["d", 1]]) }),
      player("f"),
    ];
    const warnings = computePairingWarnings(
      [threePod("a", "b", "c"), threePod("d", "e", "f")],
      players,
    );
    expect(warnings).toEqual([
      { kind: "rematch", podIndex: 0, playerIds: ["a", "b"], meetings: 1 },
      { kind: "rematch", podIndex: 1, playerIds: ["d", "e"], meetings: 1 },
    ]);
  });

  it("flags a fixed-seat player whose pod plays at a different table", () => {
    const players = [player("a", { fixedTable: 7 }), player("b"), player("c"), player("d")];
    const warnings = computePairingWarnings(
      [match("a", "b"), match("c", "d")],
      players,
      [],
      [3, 1],
    );
    expect(warnings).toEqual([
      { kind: "fixedSeatDisplaced", podIndex: 0, playerId: "a", fixedTable: 7, assignedTable: 3 },
    ]);
  });

  it("stays quiet for a fixed-seat player seated at their own table", () => {
    const players = [player("a", { fixedTable: 3 }), player("b")];
    const warnings = computePairingWarnings([match("a", "b")], players, [], [3]);
    expect(warnings).toEqual([]);
  });

  it("skips seat checks entirely when no table numbers are given", () => {
    const players = [player("a", { fixedTable: 7 }), player("b")];
    const warnings = computePairingWarnings([match("a", "b")], players);
    expect(warnings).toEqual([]);
  });

  it("flags both fixed-seat players in a pod when neither sits at their table", () => {
    const players = [player("a", { fixedTable: 7 }), player("b", { fixedTable: 3 })];
    const warnings = computePairingWarnings([match("a", "b")], players, [], [5]);
    expect(warnings).toEqual([
      { kind: "fixedSeatDisplaced", podIndex: 0, playerId: "a", fixedTable: 7, assignedTable: 5 },
      { kind: "fixedSeatDisplaced", podIndex: 0, playerId: "b", fixedTable: 3, assignedTable: 5 },
    ]);
  });
});
