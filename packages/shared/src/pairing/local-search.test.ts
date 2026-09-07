import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import { generatePairing, InvalidPlayerCountError } from "./local-search";
import type { PairingPlayer } from "./types";

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, byes: 0, opponents: new Map(), ...overrides };
}

function allIds(pods: { playerIds: string[] }[]): string[] {
  return pods.flatMap((pod) => pod.playerIds);
}

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
    const result = generatePairing(players, 1, { rng: mulberry32(7) });
    expect(result.strategy).toBe("random");
    expect(result.pods.map((pod) => pod.size).toSorted()).toEqual([3, 4, 4]);
    expect(allIds(result.pods).toSorted()).toEqual(players.map((entry) => entry.id).toSorted());
  });

  it("round 1 runs local search when pod players carry regions, avoiding mirrors", () => {
    const regions = ["noxus", "demacia", "ionia"];
    const players = Array.from({ length: 6 }, (_, index) =>
      player(`p${index}`, { region: regions[index % 3] }),
    );
    const result = generatePairing(players, 1, { rng: mulberry32(7) });
    expect(result.strategy).toBe("local-search");
    expect(result.perPod.every((breakdown) => breakdown.sameRegion === 0)).toBe(true);
    expect(allIds(result.pods).toSorted()).toEqual(players.map((entry) => entry.id).toSorted());
  });

  it("prefers a fresh region opponent over a repeated one", () => {
    const players = [
      player("a", { region: "ionia", regionHistory: new Map([["demacia", 1]]) }),
      player("b", { region: "demacia" }),
      player("c", { region: "noxus" }),
      player("d", { region: "freljord" }),
    ];
    const result = generatePairing(players, 2, { mode: "swiss", rng: mulberry32(3) });
    expect(podOf(result.pods, "a")).not.toContain("b");
    expect(result.totalPenalty).toBe(0);
  });

  it("assigns every player exactly once across pods", () => {
    const players = Array.from({ length: 14 }, (_, index) =>
      player(`p${index}`, { score: index % 3 }),
    );
    const result = generatePairing(players, 2, { rng: mulberry32(3) });
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
    const first = generatePairing(build(), 2, { rng: mulberry32(99) });
    const second = generatePairing(build(), 2, { rng: mulberry32(99) });
    expect(second.pods).toEqual(first.pods);
    expect(second.totalPenalty).toBe(first.totalPenalty);
  });
});

describe("generatePairing - priority ordering", () => {
  it("prefers a wider score spread over a rematch", () => {
    const players = [
      player("a", { score: 3, opponents: new Map([["b", 1]]) }),
      player("b", { score: 3, opponents: new Map([["a", 1]]) }),
      player("c", { score: 1 }),
      player("d", { score: 1 }),
      player("e", { score: 0 }),
      player("f", { score: 0 }),
    ];
    const result = generatePairing(players, 2, { rng: mulberry32(5) });
    const aPod = podOf(result.pods, "a");
    expect(aPod).not.toContain("b");
    expect(result.perPod.reduce((sum, pod) => sum + pod.rematch, 0)).toBe(0);
  });
});

describe("generatePairing - three-pod duty rotation", () => {
  it("moves the 3-pod off the bottom band when its players already had one", () => {
    const players = [
      player("t1", { score: 6 }),
      player("t2", { score: 6 }),
      player("t3", { score: 6 }),
      player("t4", { score: 6 }),
      player("b1", { score: 0, pods3: 1 }),
      player("b2", { score: 0, pods3: 1 }),
      player("b3", { score: 0, pods3: 1 }),
    ];
    const result = generatePairing(players, 2, { rng: mulberry32(17) });
    const threePod = result.pods.find((pod) => pod.size === 3);
    expect(threePod?.playerIds.every((id) => id.startsWith("t"))).toBe(true);
    expect(result.totalPenalty).toBe(155);
  });
});

describe("generatePairing - reaches the known optimum", () => {
  it("finds the unique rematch-free split on a hand-checked field", () => {
    const left = ["a", "b", "c"];
    const right = ["d", "e", "f"];
    const players: PairingPlayer[] = [...left, ...right].map((id) => {
      const others = left.includes(id) ? right : left;
      return player(id, { opponents: new Map(others.map((opp) => [opp, 1])) });
    });
    const result = generatePairing(players, 2, { rng: mulberry32(11) });
    expect(result.totalPenalty).toBe(0);
    expect(podOf(result.pods, "a").toSorted()).toEqual(["a", "b", "c"]);
    expect(podOf(result.pods, "d").toSorted()).toEqual(["d", "e", "f"]);
  });
});

describe("generatePairing - budget and scale", () => {
  it("respects a zero-swap budget and still returns a valid partition", () => {
    const players = Array.from({ length: 9 }, (_, index) => player(`p${index}`, { score: index }));
    const result = generatePairing(players, 2, {
      rng: mulberry32(1),
      budget: { restarts: 1, maxSwapsPerRestart: 0 },
    });
    expect(allIds(result.pods).toSorted()).toEqual(players.map((entry) => entry.id).toSorted());
    expect(result.pods.every((pod) => pod.size === 3)).toBe(true);
  });

  it("pairs a large field (24 players) into valid pods in bounded time", () => {
    const players = Array.from({ length: 24 }, (_, index) =>
      player(`p${index}`, {
        score: index % 5,
        pods3: index % 3,
        opponents: new Map([[`p${(index + 1) % 24}`, 1]]),
      }),
    );
    const result = generatePairing(players, 2, { rng: mulberry32(13) });
    expect(result.pods).toHaveLength(6);
    expect(result.pods.every((pod) => pod.size === 4)).toBe(true);
    expect(new Set(allIds(result.pods)).size).toBe(24);
  });
});

describe("generatePairing - swiss mode", () => {
  it("throws InvalidPlayerCountError for odd counts", () => {
    for (const count of [1, 3, 7]) {
      const players = Array.from({ length: count }, (_, index) => player(`p${index}`));
      expect(() => generatePairing(players, 2, { mode: "swiss" })).toThrow(InvalidPlayerCountError);
    }
  });

  it("pairs an even field into all-2 pods covering every player exactly once", () => {
    const players = Array.from({ length: 20 }, (_, index) =>
      player(`p${index}`, { score: index % 4 }),
    );
    const result = generatePairing(players, 3, { mode: "swiss", rng: mulberry32(21) });
    expect(result.pods).toHaveLength(10);
    expect(result.pods.every((pod) => pod.size === 2 && pod.playerIds.length === 2)).toBe(true);
    const ids = allIds(result.pods);
    expect(new Set(ids).size).toBe(20);
  });

  it("runs local search in round 1 and finds a region-clean perfect matching", () => {
    const regions = ["noxus", "demacia", "ionia", "zaun"];
    const players = Array.from({ length: 12 }, (_, index) =>
      player(`p${index}`, { region: regions[index % 4] }),
    );
    const result = generatePairing(players, 1, { mode: "swiss", rng: mulberry32(2) });
    expect(result.strategy).toBe("local-search");
    expect(result.totalPenalty).toBe(0);
    for (const pod of result.pods) {
      const [a, b] = pod.playerIds.map((id) => players.find((entry) => entry.id === id));
      expect(a?.region).not.toBe(b?.region);
    }
  });

  it("is reproducible for the same seed", () => {
    const build = (): PairingPlayer[] =>
      Array.from({ length: 8 }, (_, index) =>
        player(`p${index}`, { score: index % 3, region: index % 2 === 0 ? "noxus" : null }),
      );
    const first = generatePairing(build(), 4, { mode: "swiss", rng: mulberry32(77) });
    const second = generatePairing(build(), 4, { mode: "swiss", rng: mulberry32(77) });
    expect(second.pods).toEqual(first.pods);
    expect(second.totalPenalty).toBe(first.totalPenalty);
  });

  it("takes a same-region match over a rematch when forced to choose", () => {
    const players = [
      player("a1", {
        region: "noxus",
        opponents: new Map([
          ["b1", 1],
          ["b2", 1],
        ]),
      }),
      player("a2", { region: "noxus" }),
      player("b1", { region: "demacia", opponents: new Map([["a1", 1]]) }),
      player("b2", { region: "ionia", opponents: new Map([["a1", 1]]) }),
    ];
    const result = generatePairing(players, 2, { mode: "swiss", rng: mulberry32(9) });
    expect(result.perPod.reduce((sum, pod) => sum + pod.rematch, 0)).toBe(0);
    expect(result.totalPenalty).toBe(70);
    expect(podOf(result.pods, "a1").toSorted()).toEqual(["a1", "a2"]);
  });

  it("reaches across score groups to avoid a rematch", () => {
    const players = [
      player("a", { score: 3, opponents: new Map([["b", 1]]) }),
      player("b", { score: 3, opponents: new Map([["a", 1]]) }),
      player("c", { score: 0 }),
      player("d", { score: 0 }),
    ];
    const result = generatePairing(players, 2, { mode: "swiss", rng: mulberry32(4) });
    expect(podOf(result.pods, "a")).not.toContain("b");
    expect(result.perPod.reduce((sum, pod) => sum + pod.rematch, 0)).toBe(0);
  });
});
