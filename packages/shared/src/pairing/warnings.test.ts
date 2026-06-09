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
});
