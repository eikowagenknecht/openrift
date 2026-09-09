import { describe, expect, it } from "vitest";

import { conventionalBracket, nextCutRoundPairs, seedBracket } from "./cut-bracket";
import type { BracketSeed, BracketSlot } from "./group-cut-types";

function seedOf(seed: number, groupLabel: string, opponents: number[] = []): BracketSeed {
  return {
    seed,
    playerId: `p${seed}`,
    groupLabel,
    opponentIds: opponents.map((opponent) => `p${opponent}`),
  };
}

function ownGroups(count: number): BracketSeed[] {
  return Array.from({ length: count }, (_, index) =>
    seedOf(index + 1, String.fromCodePoint(65 + index)),
  );
}

function pairs(slots: readonly BracketSlot[]): number[][] {
  return slots.map((slot) => [...slot.seeds]);
}

function podOfSeed(slots: readonly BracketSlot[], seed: number): number {
  const slot = slots.find((candidate) => candidate.seeds.includes(seed));
  if (slot === undefined) {
    throw new Error(`seed ${seed} is not in the bracket`);
  }
  return slot.podNumber;
}

function adjacent(first: number, second: number): boolean {
  return Math.ceil(first / 2) === Math.ceil(second / 2) && first !== second;
}

function expectValidBracket(slots: readonly BracketSlot[], seeds: readonly BracketSeed[]): void {
  expect(slots).toHaveLength(seeds.length / 2);
  expect(slots.map((slot) => slot.podNumber)).toEqual(
    Array.from({ length: seeds.length / 2 }, (_, index) => index + 1),
  );
  expect(slots.flatMap((slot) => [...slot.seeds]).toSorted((a, b) => a - b)).toEqual(
    seeds.map((seed) => seed.seed).toSorted((a, b) => a - b),
  );
  for (const slot of slots) {
    expect(slot.seeds[0]).toBeLessThan(slot.seeds[1]);
    expect(slot.playerIds).toEqual(slot.seeds.map((seed) => `p${seed}`));
  }
}

describe("conventionalBracket", () => {
  it("pairs the top seed with the bottom seed", () => {
    expect(conventionalBracket(4)).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(conventionalBracket(8)).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect(conventionalBracket(16)).toEqual([
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ]);
  });

  it("puts the seeds that meet in the next round in adjacent slots", () => {
    const bracket = conventionalBracket(16);
    expect(bracket[0]).toContain(1);
    expect(bracket[1]).toContain(8);
    expect(bracket[4]).toContain(2);
    expect(bracket[5]).toContain(7);
  });

  it("returns a copy the caller may not mutate into the table", () => {
    const first = conventionalBracket(8);
    first[0] = [9, 9];
    expect(conventionalBracket(8)[0]).toEqual([1, 8]);
  });
});

describe("seedBracket without rematch avoidance", () => {
  it("returns the conventional bracket", () => {
    const seeds = ownGroups(8);
    expect(pairs(seedBracket(seeds, { avoidRematches: false }))).toEqual(conventionalBracket(8));
  });

  it("keeps the conventional bracket even when it repeats a group match", () => {
    const seeds = [seedOf(1, "A", [8]), seedOf(8, "A", [1]), ...ownGroups(8).slice(1, 7)];
    expect(pairs(seedBracket(seeds, { avoidRematches: false }))[0]).toEqual([1, 8]);
  });

  it("carries the player ids of the seeds", () => {
    const slots = seedBracket(ownGroups(8), { avoidRematches: false });
    expect(slots[0]).toEqual({ podNumber: 1, seeds: [1, 8], playerIds: ["p1", "p8"] });
  });

  it("refuses a count that is not a cut size", () => {
    expect(() => seedBracket(ownGroups(4).slice(0, 3), { avoidRematches: false })).toThrow(
      /cut holds/u,
    );
  });

  it("refuses a gap in the seed numbers", () => {
    const seeds = [...ownGroups(7), seedOf(9, "H")];
    expect(() => seedBracket(seeds, { avoidRematches: false })).toThrow(/seed 8 is missing/u);
  });
});

describe("seedBracket with rematch avoidance", () => {
  it("stays conventional when no group meets again", () => {
    const seeds = ownGroups(8);
    expect(pairs(seedBracket(seeds, { avoidRematches: true }))).toEqual(conventionalBracket(8));
  });

  it("splits up a quarterfinal rematch", () => {
    const seeds = [
      seedOf(1, "A", [8]),
      seedOf(2, "B"),
      seedOf(3, "C"),
      seedOf(4, "D"),
      seedOf(5, "E"),
      seedOf(6, "F"),
      seedOf(7, "G"),
      seedOf(8, "A", [1]),
    ];
    const slots = seedBracket(seeds, { avoidRematches: true });
    expectValidBracket(slots, seeds);
    expect(pairs(slots)).toEqual([
      [1, 7],
      [4, 5],
      [2, 8],
      [3, 6],
    ]);
    expect(adjacent(podOfSeed(slots, 1), podOfSeed(slots, 8))).toBe(false);
  });

  it("keeps the first-round pairings strength-balanced", () => {
    const seeds = [
      seedOf(1, "A", [8]),
      seedOf(2, "B"),
      seedOf(3, "C"),
      seedOf(4, "D"),
      seedOf(5, "E"),
      seedOf(6, "F"),
      seedOf(7, "G"),
      seedOf(8, "A", [1]),
    ];
    const slots = seedBracket(seeds, { avoidRematches: true });
    const drift = slots.map((slot) => Math.abs(slot.seeds[0] + slot.seeds[1] - 9));
    expect(drift.reduce((total, value) => total + value, 0)).toBe(2);
    for (const slot of slots) {
      expect(slot.seeds[0] + slot.seeds[1]).toBeGreaterThanOrEqual(8);
      expect(slot.seeds[0] + slot.seeds[1]).toBeLessThanOrEqual(10);
    }
  });

  it("keeps a possible semifinal between group mates apart", () => {
    const seeds = [
      seedOf(1, "A", [4]),
      seedOf(2, "B"),
      seedOf(3, "C"),
      seedOf(4, "A", [1]),
      seedOf(5, "D"),
      seedOf(6, "E"),
      seedOf(7, "F"),
      seedOf(8, "G"),
    ];
    expect(adjacent(1, 2)).toBe(true);
    const conventional = seedBracket(seeds, { avoidRematches: false });
    expect(adjacent(podOfSeed(conventional, 1), podOfSeed(conventional, 4))).toBe(true);
    const slots = seedBracket(seeds, { avoidRematches: true });
    expectValidBracket(slots, seeds);
    expect(podOfSeed(slots, 1)).not.toBe(podOfSeed(slots, 4));
    expect(adjacent(podOfSeed(slots, 1), podOfSeed(slots, 4))).toBe(false);
    expect(pairs(slots)).toEqual([
      [1, 8],
      [2, 7],
      [4, 5],
      [3, 6],
    ]);
  });

  it("takes a possible final between group mates over a first-round rematch", () => {
    const seeds = [seedOf(1, "A", [2]), seedOf(2, "A", [1]), seedOf(3, "B"), seedOf(4, "C")];
    const slots = seedBracket(seeds, { avoidRematches: true });
    expectValidBracket(slots, seeds);
    expect(podOfSeed(slots, 1)).not.toBe(podOfSeed(slots, 2));
    expect(adjacent(podOfSeed(slots, 1), podOfSeed(slots, 2))).toBe(true);
  });

  it("returns a valid bracket with the fewest rematches when none can be avoided", () => {
    const seeds = [
      seedOf(1, "A", [2, 3, 4]),
      seedOf(2, "A", [1, 3, 4]),
      seedOf(3, "A", [1, 2, 4]),
      seedOf(4, "A", [1, 2, 3]),
    ];
    const slots = seedBracket(seeds, { avoidRematches: true });
    expectValidBracket(slots, seeds);
    expect(slots).toHaveLength(2);
  });

  it("is deterministic and ignores the order of the input seeds", () => {
    const seeds = [
      seedOf(1, "A", [8]),
      seedOf(2, "B", [7]),
      seedOf(3, "C"),
      seedOf(4, "D"),
      seedOf(5, "E"),
      seedOf(6, "F"),
      seedOf(7, "B", [2]),
      seedOf(8, "A", [1]),
    ];
    const first = seedBracket(seeds, { avoidRematches: true });
    const second = seedBracket(seeds.toReversed(), { avoidRematches: true });
    expect(pairs(second)).toEqual(pairs(first));
    expect(pairs(seedBracket(seeds, { avoidRematches: true }))).toEqual(pairs(first));
    expect(podOfSeed(first, 1)).not.toBe(podOfSeed(first, 8));
    expect(podOfSeed(first, 2)).not.toBe(podOfSeed(first, 7));
  });

  it("moves positions without changing a seed's identity", () => {
    const seeds = [
      seedOf(1, "A", [8]),
      seedOf(2, "B"),
      seedOf(3, "C"),
      seedOf(4, "D"),
      seedOf(5, "E"),
      seedOf(6, "F"),
      seedOf(7, "G"),
      seedOf(8, "A", [1]),
    ];
    const slots = seedBracket(seeds, { avoidRematches: true });
    expect(pairs(slots)).not.toEqual(conventionalBracket(8));
    for (const slot of slots) {
      expect(slot.playerIds).toEqual(slot.seeds.map((seed) => `p${seed}`));
    }
  });

  it("handles a top 4", () => {
    const seeds = [seedOf(1, "A", [4]), seedOf(2, "B"), seedOf(3, "C"), seedOf(4, "A", [1])];
    const slots = seedBracket(seeds, { avoidRematches: true });
    expectValidBracket(slots, seeds);
    expect(pairs(slots)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it("handles a top 16 by swap descent", () => {
    const seeds = Array.from({ length: 16 }, (_, index) =>
      seedOf(index + 1, String.fromCodePoint(65 + (index % 4))),
    );
    const withRematch = seeds.map((seed) =>
      seed.seed === 1 || seed.seed === 16
        ? { ...seed, groupLabel: "A", opponentIds: [`p${seed.seed === 1 ? 16 : 1}`] }
        : seed,
    );
    const slots = seedBracket(withRematch, { avoidRematches: true });
    expectValidBracket(slots, withRematch);
    expect(podOfSeed(slots, 1)).not.toBe(podOfSeed(slots, 16));
    expect(pairs(seedBracket(withRematch, { avoidRematches: true }))).toEqual(pairs(slots));
    const drift = slots
      .map((slot) => Math.abs(slot.seeds[0] + slot.seeds[1] - 17))
      .reduce((total, value) => total + value, 0);
    expect(drift).toBeLessThanOrEqual(6);
  });

  it("leaves a top 16 without conflicts conventional", () => {
    const seeds = ownGroups(16);
    expect(pairs(seedBracket(seeds, { avoidRematches: true }))).toEqual(conventionalBracket(16));
  });
});

describe("nextCutRoundPairs", () => {
  const seedByPlayer = new Map([
    ["p1", 1],
    ["p2", 2],
    ["p4", 4],
    ["p5", 5],
    ["p7", 7],
    ["p8", 8],
  ]);

  it("feeds pods 2k-1 and 2k into pod k", () => {
    const slots = nextCutRoundPairs(
      [
        { podNumber: 1, winnerId: "p1" },
        { podNumber: 2, winnerId: "p5" },
        { podNumber: 3, winnerId: "p2" },
        { podNumber: 4, winnerId: "p7" },
      ],
      seedByPlayer,
    );
    expect(slots).toEqual([
      { podNumber: 1, seeds: [1, 5], playerIds: ["p1", "p5"] },
      { podNumber: 2, seeds: [2, 7], playerIds: ["p2", "p7"] },
    ]);
  });

  it("puts the higher seed first", () => {
    const slots = nextCutRoundPairs(
      [
        { podNumber: 1, winnerId: "p8" },
        { podNumber: 2, winnerId: "p4" },
      ],
      seedByPlayer,
    );
    expect(slots).toEqual([{ podNumber: 1, seeds: [4, 8], playerIds: ["p4", "p8"] }]);
  });

  it("sorts the previous round by pod number", () => {
    const slots = nextCutRoundPairs(
      [
        { podNumber: 4, winnerId: "p7" },
        { podNumber: 2, winnerId: "p5" },
        { podNumber: 3, winnerId: "p2" },
        { podNumber: 1, winnerId: "p1" },
      ],
      seedByPlayer,
    );
    expect(slots.map((slot) => slot.playerIds)).toEqual([
      ["p1", "p5"],
      ["p2", "p7"],
    ]);
  });

  it("refuses an odd pod count", () => {
    expect(() => nextCutRoundPairs([{ podNumber: 1, winnerId: "p1" }], seedByPlayer)).toThrow(
      /even pod count/u,
    );
  });

  it("refuses a winner without a seed", () => {
    expect(() =>
      nextCutRoundPairs(
        [
          { podNumber: 1, winnerId: "p1" },
          { podNumber: 2, winnerId: "unknown" },
        ],
        seedByPlayer,
      ),
    ).toThrow(/no seed for unknown/u);
  });
});
