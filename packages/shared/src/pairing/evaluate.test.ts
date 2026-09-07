import { describe, expect, it } from "vitest";

import { evaluatePairing, evaluatePod } from "./evaluate";
import type { PairingPlayer, Pod } from "./types";

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, byes: 0, opponents: new Map(), ...overrides };
}

function mapOf(players: PairingPlayer[]): Map<string, PairingPlayer> {
  return new Map(players.map((entry) => [entry.id, entry]));
}

const POD4: Pod = { size: 4, playerIds: ["a", "b", "c", "d"] };
const POD3: Pod = { size: 3, playerIds: ["a", "b", "c"] };

describe("evaluatePod - rematch tiers", () => {
  it("charges 0 / 100 / 500 / 2000 for 0 / 1 / 2 / 3 prior meetings", () => {
    for (const [meetings, expected] of [
      [0, 0],
      [1, 100],
      [2, 500],
      [3, 2000],
      [4, 2000],
    ] as const) {
      const players = mapOf([
        player("a", { opponents: new Map([["b", meetings]]) }),
        player("b", { opponents: new Map([["a", meetings]]) }),
        player("c"),
        player("d"),
      ]);
      const breakdown = evaluatePod(POD4, players, undefined);
      expect(breakdown.rematch).toBe(expected);
      expect(breakdown.rematchPairs).toBe(meetings > 0 ? 1 : 0);
    }
  });

  it("sums rematch across every in-pod pair", () => {
    const players = mapOf([
      player("a", {
        opponents: new Map([
          ["b", 1],
          ["c", 2],
        ]),
      }),
      player("b", { opponents: new Map([["a", 1]]) }),
      player("c", { opponents: new Map([["a", 2]]) }),
      player("d"),
    ]);
    const breakdown = evaluatePod(POD4, players, undefined);
    expect(breakdown.rematch).toBe(100 + 500);
    expect(breakdown.rematchPairs).toBe(2);
  });
});

describe("evaluatePod - score spread and surcharges", () => {
  it("charges spread * 10 below the surcharge threshold", () => {
    const players = mapOf([player("a", { score: 5 }), player("b"), player("c"), player("d")]);
    const breakdown = evaluatePod(POD4, players, undefined);
    expect(breakdown.spread).toBe(5);
    expect(breakdown.scoreSpread).toBe(50);
    expect(breakdown.imbalance).toBe(0);
  });

  it("adds the +50 surcharge once at spread 6", () => {
    const players = mapOf([player("a", { score: 6 }), player("b"), player("c"), player("d")]);
    const breakdown = evaluatePod(POD4, players, undefined);
    expect(breakdown.scoreSpread).toBe(60);
    expect(breakdown.imbalance).toBe(50);
  });

  it("stacks +50 and +150 at spread 9", () => {
    const players = mapOf([player("a", { score: 9 }), player("b"), player("c"), player("d")]);
    const breakdown = evaluatePod(POD4, players, undefined);
    expect(breakdown.scoreSpread).toBe(90);
    expect(breakdown.imbalance).toBe(200);
  });
});

describe("evaluatePod - float", () => {
  it("charges sum of |score - podAverage| * 5", () => {
    const players = mapOf([player("a", { score: 3 }), player("b"), player("c")]);
    const breakdown = evaluatePod(POD3, players, undefined);
    expect(breakdown.float).toBe(20);
  });

  it("is zero when every score is equal", () => {
    const players = mapOf([
      player("a", { score: 4 }),
      player("b", { score: 4 }),
      player("c", { score: 4 }),
      player("d", { score: 4 }),
    ]);
    expect(evaluatePod(POD4, players, undefined).float).toBe(0);
  });
});

describe("evaluatePod - three-pod repeat", () => {
  it("charges 0 / 120 / 600 / 2400 per 3-pod player by prior 3-pod count", () => {
    for (const [pods3, expected] of [
      [0, 0],
      [1, 120],
      [2, 600],
      [3, 2400],
      [4, 2400],
    ] as const) {
      const players = mapOf([player("a", { pods3 }), player("b"), player("c")]);
      expect(evaluatePod(POD3, players, undefined).threePodRepeat).toBe(expected);
    }
  });

  it("never charges three-pod repeat in a 4-pod", () => {
    const players = mapOf([
      player("a", { pods3: 3 }),
      player("b", { pods3: 3 }),
      player("c", { pods3: 3 }),
      player("d", { pods3: 3 }),
    ]);
    expect(evaluatePod(POD4, players, undefined).threePodRepeat).toBe(0);
  });
});

describe("evaluatePod - same region", () => {
  const MATCH: Pod = { size: 2, playerIds: ["a", "b"] };

  it("charges 70 for a 1v1 match between same-region players", () => {
    const players = mapOf([player("a", { region: "noxus" }), player("b", { region: "noxus" })]);
    expect(evaluatePod(MATCH, players, undefined).sameRegion).toBe(70);
  });

  it("charges nothing for different regions", () => {
    const players = mapOf([player("a", { region: "noxus" }), player("b", { region: "demacia" })]);
    expect(evaluatePod(MATCH, players, undefined).sameRegion).toBe(0);
  });

  it("never matches players without a region, even against each other", () => {
    const players = mapOf([
      player("a", { region: null }),
      player("b", { region: null }),
      player("c"),
      player("d", { region: "noxus" }),
    ]);
    expect(evaluatePod(POD4, players, undefined).sameRegion).toBe(0);
  });

  it("charges per same-region pair inside a larger pod", () => {
    const players = mapOf([
      player("a", { region: "noxus" }),
      player("b", { region: "noxus" }),
      player("c", { region: "noxus" }),
      player("d", { region: "ionia" }),
    ]);
    expect(evaluatePod(POD4, players, undefined).sameRegion).toBe(210);
  });

  it("loses to a first rematch under the default weights", () => {
    const players = mapOf([
      player("a", { region: "noxus", opponents: new Map([["b", 1]]) }),
      player("b", { region: "demacia", opponents: new Map([["a", 1]]) }),
    ]);
    const rematchBreakdown = evaluatePod(MATCH, players, undefined);
    const mirrorPlayers = mapOf([
      player("a", { region: "noxus" }),
      player("b", { region: "noxus" }),
    ]);
    const mirrorBreakdown = evaluatePod(MATCH, mirrorPlayers, undefined);
    expect(mirrorBreakdown.total).toBeLessThan(rematchBreakdown.total);
  });
});

describe("evaluatePod - repeated region", () => {
  const MATCH: Pod = { size: 2, playerIds: ["a", "b"] };

  it("charges 25 per prior meeting with the other player's region, both directions", () => {
    const players = mapOf([
      player("a", { region: "noxus", regionHistory: new Map([["demacia", 2]]) }),
      player("b", { region: "demacia", regionHistory: new Map([["noxus", 1]]) }),
    ]);
    expect(evaluatePod(MATCH, players, undefined).repeatedRegion).toBe(75);
  });

  it("charges nothing without history or without regions", () => {
    const fresh = mapOf([player("a", { region: "noxus" }), player("b", { region: "demacia" })]);
    expect(evaluatePod(MATCH, fresh, undefined).repeatedRegion).toBe(0);

    const regionless = mapOf([
      player("a", { regionHistory: new Map([["noxus", 3]]) }),
      player("b"),
    ]);
    expect(evaluatePod(MATCH, regionless, undefined).repeatedRegion).toBe(0);
  });

  it("loses to a live same-region mirror under the default weights", () => {
    const repeatPlayers = mapOf([
      player("a", { region: "noxus", regionHistory: new Map([["demacia", 1]]) }),
      player("b", { region: "demacia" }),
    ]);
    const mirrorPlayers = mapOf([
      player("a", { region: "noxus" }),
      player("b", { region: "noxus" }),
    ]);
    expect(evaluatePod(MATCH, repeatPlayers, undefined).total).toBeLessThan(
      evaluatePod(MATCH, mirrorPlayers, undefined).total,
    );
  });
});

describe("evaluatePairing", () => {
  it("sums per-pod totals into the round penalty", () => {
    const players = [
      player("a", { score: 3 }),
      player("b"),
      player("c"),
      player("d", { score: 3 }),
      player("e"),
      player("f"),
    ];
    const pods: Pod[] = [
      { size: 3, playerIds: ["a", "b", "c"] },
      { size: 3, playerIds: ["d", "e", "f"] },
    ];
    const result = evaluatePairing(pods, players);
    expect(result.perPod).toHaveLength(2);
    expect(result.totalPenalty).toBeCloseTo(result.perPod[0]!.total + result.perPod[1]!.total);
  });

  it("named penalty terms sum to the pod total under the default config", () => {
    const players = mapOf([
      player("a", {
        score: 9,
        pods3: 2,
        opponents: new Map([["b", 2]]),
        region: "noxus",
        regionHistory: new Map([["noxus", 2]]),
      }),
      player("b", {
        score: 1,
        opponents: new Map([["a", 2]]),
        region: "noxus",
        regionHistory: new Map([["noxus", 2]]),
      }),
      player("c", { score: 0 }),
    ]);
    const breakdown = evaluatePod(POD3, players, undefined);
    const sum =
      breakdown.rematch +
      breakdown.scoreSpread +
      breakdown.imbalance +
      breakdown.float +
      breakdown.threePodRepeat +
      breakdown.sameRegion +
      breakdown.repeatedRegion;
    expect(sum).toBeCloseTo(breakdown.total);
  });
});
