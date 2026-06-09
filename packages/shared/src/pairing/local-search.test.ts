import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import { generatePairing, InvalidPlayerCountError } from "./local-search";
import type { PairingPlayer } from "./types";

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, opponents: new Map(), ...overrides };
}

// All player ids across the pairing, for coverage/uniqueness checks.
function allIds(pods: { playerIds: string[] }[]): string[] {
  return pods.flatMap((pod) => pod.playerIds);
}

// Find the pod that contains a given player.
function podOf(pods: { playerIds: string[] }[], id: string): string[] {
  return pods.find((pod) => pod.playerIds.includes(id))?.playerIds ?? [];
}

describe("generatePairing - validity", () => {
  it("throws InvalidPlayerCountError for unrepresentable counts", () => {
    for (const count of [1, 2, 5]) {
      const players = Array.from({ length: count }, (_, index) => player(`p${index}`));
      expect(() => generatePairing(players, 2)).toThrow(InvalidPlayerCountError);
    }
  });

  it("round 1 returns a random valid partition that respects the pod sizes", () => {
    const players = Array.from({ length: 11 }, (_, index) => player(`p${index}`));
    const result = generatePairing(players, 1, undefined, mulberry32(7));
    expect(result.strategy).toBe("random");
    // 11 -> 2 fours + 1 three
    expect(result.pods.map((pod) => pod.size).toSorted()).toEqual([3, 4, 4]);
    expect(allIds(result.pods).toSorted()).toEqual(players.map((entry) => entry.id).toSorted());
  });

  it("assigns every player exactly once across pods", () => {
    const players = Array.from({ length: 14 }, (_, index) =>
      player(`p${index}`, { score: index % 3 }),
    );
    const result = generatePairing(players, 2, undefined, mulberry32(3));
    const ids = allIds(result.pods);
    expect(new Set(ids).size).toBe(14);
    expect(ids).toHaveLength(14);
  });
});

describe("generatePairing - determinism", () => {
  it("is reproducible for the same seed", () => {
    const build = (): PairingPlayer[] =>
      Array.from({ length: 10 }, (_, index) =>
        player(`p${index}`, { score: index % 4, pods3: index % 2 }),
      );
    const first = generatePairing(build(), 2, undefined, mulberry32(99));
    const second = generatePairing(build(), 2, undefined, mulberry32(99));
    expect(second.pods).toEqual(first.pods);
    expect(second.totalPenalty).toBe(first.totalPenalty);
  });
});

describe("generatePairing - priority ordering", () => {
  it("prefers a wider score spread over a rematch", () => {
    // a and b have met; the score-sorted seed would pod them together (both 3).
    // The engine must split them even though that widens the spread.
    const players = [
      player("a", { score: 3, opponents: new Map([["b", 1]]) }),
      player("b", { score: 3, opponents: new Map([["a", 1]]) }),
      player("c", { score: 1 }),
      player("d", { score: 1 }),
      player("e", { score: 0 }),
      player("f", { score: 0 }),
    ];
    const result = generatePairing(players, 2, undefined, mulberry32(5));
    const aPod = podOf(result.pods, "a");
    expect(aPod).not.toContain("b");
    // No rematch anywhere in the round.
    expect(result.perPod.reduce((sum, pod) => sum + pod.rematch, 0)).toBe(0);
  });
});

describe("generatePairing - reaches the known optimum", () => {
  it("finds the unique rematch-free split on a hand-checked field", () => {
    // K(3,3) "has met" graph: every {a,b,c} has met every {d,e,f}, none within a
    // group. The only zero-penalty split keeps {a,b,c} and {d,e,f} intact.
    const left = ["a", "b", "c"];
    const right = ["d", "e", "f"];
    const players: PairingPlayer[] = [...left, ...right].map((id) => {
      const others = left.includes(id) ? right : left;
      return player(id, { opponents: new Map(others.map((opp) => [opp, 1])) });
    });
    const result = generatePairing(players, 2, undefined, mulberry32(11));
    expect(result.totalPenalty).toBe(0);
    expect(podOf(result.pods, "a").toSorted()).toEqual(["a", "b", "c"]);
    expect(podOf(result.pods, "d").toSorted()).toEqual(["d", "e", "f"]);
  });
});

describe("generatePairing - budget and scale", () => {
  it("respects a zero-swap budget and still returns a valid partition", () => {
    const players = Array.from({ length: 9 }, (_, index) => player(`p${index}`, { score: index }));
    const result = generatePairing(players, 2, undefined, mulberry32(1), {
      restarts: 1,
      maxSwapsPerRestart: 0,
    });
    expect(allIds(result.pods).toSorted()).toEqual(players.map((entry) => entry.id).toSorted());
    expect(result.pods.every((pod) => pod.size === 3)).toBe(true); // 9 -> 3 threes
  });

  it("pairs a large field (24 players) into valid pods in bounded time", () => {
    const players = Array.from({ length: 24 }, (_, index) =>
      player(`p${index}`, {
        score: index % 5,
        pods3: index % 3,
        opponents: new Map([[`p${(index + 1) % 24}`, 1]]),
      }),
    );
    const result = generatePairing(players, 2, undefined, mulberry32(13));
    // 24 -> 6 fours
    expect(result.pods).toHaveLength(6);
    expect(result.pods.every((pod) => pod.size === 4)).toBe(true);
    expect(new Set(allIds(result.pods)).size).toBe(24);
  });
});
