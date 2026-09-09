import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import type { GroupPlan, GroupPlanGroup } from "./group-cut-types";
import {
  InvalidGroupCountError,
  groupUnits,
  planGroups,
  unitRoundPairs,
  validateGroupCount,
} from "./group-stage";

function players(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`);
}

const ROUNDS = [1, 2, 3] as const;

function unitMatches(unit: readonly GroupPlanGroup[]): {
  round: 1 | 2 | 3;
  pair: [string, string];
  cross: boolean;
}[] {
  return ROUNDS.flatMap((round) =>
    unitRoundPairs(unit, round).map((match) => ({ round, ...match })),
  );
}

function pairKey(pair: readonly [string, string]): string {
  return pair.toSorted().join("|");
}

const TOP_CUT_STRUCTURES: [count: number, fours: number, threes: number][] = [
  [16, 4, 0],
  [18, 3, 2],
  [20, 5, 0],
  [22, 4, 2],
  [24, 6, 0],
  [26, 5, 2],
  [28, 7, 0],
  [30, 6, 2],
  [32, 8, 0],
];

const LARGER_STRUCTURES: [count: number, fours: number, threes: number][] = [
  [34, 7, 2],
  [36, 9, 0],
  [40, 10, 0],
  [46, 10, 2],
  [50, 11, 2],
  [56, 14, 0],
  [62, 14, 2],
  [64, 16, 0],
];

function expectValidStructure(plan: GroupPlan, playerIds: readonly string[]): void {
  const sizes = plan.groups.map((group) => group.playerIds.length);
  expect(sizes.filter((size) => size !== 3 && size !== 4)).toEqual([]);
  const threes = plan.groups.filter((group) => group.playerIds.length === 3);
  expect([0, 2]).toContain(threes.length);
  for (const three of threes) {
    const partner = plan.groups.find((group) => group.label === three.pairedWith);
    expect(partner?.playerIds).toHaveLength(3);
    expect(partner?.pairedWith).toBe(three.label);
    expect(partner?.label).not.toBe(three.label);
  }
  for (const four of plan.groups.filter((group) => group.playerIds.length === 4)) {
    expect(four.pairedWith).toBeNull();
  }
  const seated = plan.groups.flatMap((group) => group.playerIds);
  expect(seated).toHaveLength(playerIds.length);
  expect(seated.toSorted()).toEqual([...playerIds].toSorted());
}

describe("validateGroupCount", () => {
  it.each([16, 18, 20, 22, 24, 26, 28, 30, 32])("accepts %i players", (count) => {
    expect(() => validateGroupCount(count)).not.toThrow();
  });

  it.each([6, 10, 12, 14])("accepts the small count %i", (count) => {
    expect(() => validateGroupCount(count)).not.toThrow();
  });

  it.each([17, 19, 21, 23, 25, 27, 29, 31])("refuses the odd count %i", (count) => {
    expect(() => validateGroupCount(count)).toThrow(InvalidGroupCountError);
  });

  it.each([4, 5, 7])("refuses %i players", (count) => {
    expect(() => validateGroupCount(count)).toThrow(InvalidGroupCountError);
  });

  it("names the fix in the message an organizer sees", () => {
    expect(() => validateGroupCount(17)).toThrow(/Add or drop one player/u);
    expect(() => validateGroupCount(4)).toThrow(/at least 6/u);
  });

  it("carries the refused count", () => {
    try {
      validateGroupCount(21);
      expect.unreachable("validateGroupCount should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidGroupCountError);
      expect((error as InvalidGroupCountError).playerCount).toBe(21);
    }
  });
});

describe("planGroups", () => {
  it("is deterministic for a seeded rng", () => {
    const first = planGroups(players(18), mulberry32(7));
    const second = planGroups(players(18), mulberry32(7));
    expect(first).toEqual(second);
  });

  it("shuffles: the plan is not the input order", () => {
    const plan = planGroups(players(16), mulberry32(3));
    expect(plan.groups.flatMap((group) => group.playerIds)).not.toEqual(players(16));
  });

  it.each([6, 10, 12, 14, 16, 18, 20, 24, 28, 32])(
    "seats every player exactly once for %i",
    (count) => {
      const plan = planGroups(players(count), mulberry32(count));
      const seated = plan.groups.flatMap((group) => group.playerIds);
      expect(seated).toHaveLength(count);
      expect(new Set(seated).size).toBe(count);
      expect(seated.toSorted()).toEqual(players(count).toSorted());
    },
  );

  it("splits 16 into four 4-player groups", () => {
    const plan = planGroups(players(16), mulberry32(1));
    expect(plan.groups.map((group) => group.playerIds.length)).toEqual([4, 4, 4, 4]);
    expect(plan.groups.map((group) => group.label)).toEqual(["A", "B", "C", "D"]);
    expect(plan.groups.every((group) => group.pairedWith === null)).toBe(true);
  });

  it("puts the two paired 3-player groups last for 18", () => {
    const plan = planGroups(players(18), mulberry32(2));
    expect(plan.groups.map((group) => group.playerIds.length)).toEqual([4, 4, 4, 3, 3]);
    expect(plan.groups.map((group) => group.label)).toEqual(["A", "B", "C", "D", "E"]);
    expect(plan.groups.map((group) => group.pairedWith)).toEqual([null, null, null, "E", "D"]);
  });

  it("splits 6 into two paired 3-player groups", () => {
    const plan = planGroups(players(6), mulberry32(5));
    expect(plan.groups.map((group) => group.playerIds.length)).toEqual([3, 3]);
    expect(plan.groups.map((group) => group.pairedWith)).toEqual(["B", "A"]);
  });

  it("splits 10 into one 4-player group and two paired 3-player groups", () => {
    const plan = planGroups(players(10), mulberry32(9));
    expect(plan.groups.map((group) => group.playerIds.length)).toEqual([4, 3, 3]);
    expect(plan.groups.map((group) => group.pairedWith)).toEqual([null, "C", "B"]);
  });

  it("refuses a count that does not fill the groups", () => {
    expect(() => planGroups(players(17), mulberry32(1))).toThrow(InvalidGroupCountError);
  });

  it.each(TOP_CUT_STRUCTURES)(
    "builds %i groups of four and %i of three out of %i players",
    (count, fours, threes) => {
      const plan = planGroups(players(count), mulberry32(count));
      const sizes = plan.groups.map((group) => group.playerIds.length);
      expect(sizes.filter((size) => size === 4)).toHaveLength(fours);
      expect(sizes.filter((size) => size === 3)).toHaveLength(threes);
      expectValidStructure(plan, players(count));
    },
  );

  it.each(LARGER_STRUCTURES)(
    "keeps the same shape past a top 8 with %i players",
    (count, fours, threes) => {
      const plan = planGroups(players(count), mulberry32(count));
      const sizes = plan.groups.map((group) => group.playerIds.length);
      expect(sizes.filter((size) => size === 4)).toHaveLength(fours);
      expect(sizes.filter((size) => size === 3)).toHaveLength(threes);
      expectValidStructure(plan, players(count));
    },
  );

  it.each([17, 19, 21, 23, 25, 27, 29, 31])("refuses the odd count %i", (count) => {
    expect(() => planGroups(players(count), mulberry32(count))).toThrow(InvalidGroupCountError);
  });

  it.each([35, 41, 47, 53, 59, 63])("refuses the larger odd count %i", (count) => {
    expect(() => planGroups(players(count), mulberry32(count))).toThrow(InvalidGroupCountError);
  });

  it("gives a different but valid plan for a different seed", () => {
    const first = planGroups(players(18), mulberry32(11));
    const second = planGroups(players(18), mulberry32(12));
    expect(second.groups.map((group) => group.playerIds)).not.toEqual(
      first.groups.map((group) => group.playerIds),
    );
    expectValidStructure(first, players(18));
    expectValidStructure(second, players(18));
  });
});

describe("groupUnits", () => {
  it("gives every 4-player group its own unit", () => {
    const plan = planGroups(players(16), mulberry32(1));
    const units = groupUnits(plan);
    expect(units).toHaveLength(4);
    expect(units.every((unit) => unit.length === 1)).toBe(true);
  });

  it("keeps the paired 3-player groups in one unit", () => {
    const plan = planGroups(players(18), mulberry32(2));
    const units = groupUnits(plan);
    expect(units.map((unit) => unit.map((group) => group.label))).toEqual([
      ["A"],
      ["B"],
      ["C"],
      ["D", "E"],
    ]);
  });

  it("throws when a pairing points at an unknown group", () => {
    expect(() =>
      groupUnits({ groups: [{ label: "A", playerIds: ["a", "b", "c"], pairedWith: "Z" }] }),
    ).toThrow(/unknown group/u);
  });
});

describe("unitRoundPairs", () => {
  const fourGroup: GroupPlanGroup = {
    label: "A",
    playerIds: ["s0", "s1", "s2", "s3"],
    pairedWith: null,
  };
  const pairedUnit: GroupPlanGroup[] = [
    { label: "D", playerIds: ["d0", "d1", "d2"], pairedWith: "E" },
    { label: "E", playerIds: ["e0", "e1", "e2"], pairedWith: "D" },
  ];

  it("uses the fixed table for a 4-player group", () => {
    expect(unitRoundPairs([fourGroup], 1).map((match) => match.pair)).toEqual([
      ["s0", "s1"],
      ["s2", "s3"],
    ]);
    expect(unitRoundPairs([fourGroup], 2).map((match) => match.pair)).toEqual([
      ["s0", "s2"],
      ["s1", "s3"],
    ]);
    expect(unitRoundPairs([fourGroup], 3).map((match) => match.pair)).toEqual([
      ["s0", "s3"],
      ["s1", "s2"],
    ]);
  });

  it("marks no 4-player match as cross-group", () => {
    expect(unitMatches([fourGroup]).every((match) => !match.cross)).toBe(true);
  });

  it("pairs slot r-1 across the paired groups", () => {
    expect(unitRoundPairs(pairedUnit, 1)).toEqual([
      { pair: ["d0", "e0"], cross: true },
      { pair: ["d1", "d2"], cross: false },
      { pair: ["e1", "e2"], cross: false },
    ]);
    expect(unitRoundPairs(pairedUnit, 2)).toEqual([
      { pair: ["d1", "e1"], cross: true },
      { pair: ["d0", "d2"], cross: false },
      { pair: ["e0", "e2"], cross: false },
    ]);
    expect(unitRoundPairs(pairedUnit, 3)).toEqual([
      { pair: ["d2", "e2"], cross: true },
      { pair: ["d0", "d1"], cross: false },
      { pair: ["e0", "e1"], cross: false },
    ]);
  });

  it.each([
    ["a 4-player group", [fourGroup]],
    ["the paired 3-player groups", pairedUnit],
  ])("gives every player of %s three matches, one per round", (_label, unit) => {
    const matches = unitMatches(unit);
    const seats = unit.flatMap((group) => group.playerIds);
    for (const playerId of seats) {
      const own = matches.filter((match) => match.pair.includes(playerId));
      expect(own).toHaveLength(3);
      expect(own.map((match) => match.round).toSorted()).toEqual([1, 2, 3]);
      expect(new Set(own.flatMap((match) => match.pair)).size).toBe(4);
    }
  });

  it.each([
    ["a 4-player group", [fourGroup]],
    ["the paired 3-player groups", pairedUnit],
  ])("has every pair of %s meet at most once", (_label, unit) => {
    const keys = unitMatches(unit).map((match) => pairKey(match.pair));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every player of a 4-player group all three group mates", () => {
    const keys = new Set(unitMatches([fourGroup]).map((match) => pairKey(match.pair)));
    expect(keys.size).toBe(6);
  });

  it("gives every paired-group player two intra and one cross match", () => {
    const matches = unitMatches(pairedUnit);
    for (const group of pairedUnit) {
      for (const playerId of group.playerIds) {
        const own = matches.filter((match) => match.pair.includes(playerId));
        expect(own.filter((match) => match.cross)).toHaveLength(1);
        expect(own.filter((match) => !match.cross)).toHaveLength(2);
      }
    }
  });

  it("seats everybody in every round", () => {
    for (const round of ROUNDS) {
      expect(unitRoundPairs(pairedUnit, round).flatMap((match) => match.pair)).toHaveLength(6);
      expect(unitRoundPairs([fourGroup], round).flatMap((match) => match.pair)).toHaveLength(4);
    }
  });

  it.each([
    ["a 4-player group", [fourGroup], 6, 2],
    ["the paired 3-player groups", pairedUnit, 9, 3],
  ])("plays %s over three rounds of a fixed size", (_label, unit, total, perRound) => {
    const matches = unitMatches(unit);
    expect(matches).toHaveLength(total);
    expect(new Set(matches.map((match) => match.round))).toEqual(new Set(ROUNDS));
    for (const round of ROUNDS) {
      expect(matches.filter((match) => match.round === round)).toHaveLength(perRound);
    }
  });

  it.each([
    ["a 4-player group", [fourGroup]],
    ["the paired 3-player groups", pairedUnit],
  ])("never seats a player of %s against themselves", (_label, unit) => {
    for (const match of unitMatches(unit)) {
      expect(match.pair[0]).not.toBe(match.pair[1]);
    }
  });

  it("meets every one of the six pairs of a 4-player group exactly once", () => {
    const keys = unitMatches([fourGroup]).map((match) => pairKey(match.pair));
    expect(keys.toSorted()).toEqual(["s0|s1", "s0|s2", "s0|s3", "s1|s2", "s1|s3", "s2|s3"]);
  });

  it("plays one cross-group match per round and three in total", () => {
    const matches = unitMatches(pairedUnit);
    expect(matches.filter((match) => match.cross)).toHaveLength(3);
    for (const round of ROUNDS) {
      expect(matches.filter((match) => match.round === round && match.cross)).toHaveLength(1);
    }
  });

  it("assigns the cross-group opponents one to one", () => {
    const crossPairs = unitMatches(pairedUnit)
      .filter((match) => match.cross)
      .map((match) => match.pair);
    expect(crossPairs.map(([first]) => first).toSorted()).toEqual(["d0", "d1", "d2"]);
    expect(crossPairs.map(([, second]) => second).toSorted()).toEqual(["e0", "e1", "e2"]);
  });

  it("completes each 3-player group's own round robin inside the pair", () => {
    const intra = unitMatches(pairedUnit).filter((match) => !match.cross);
    for (const group of pairedUnit) {
      const own = intra.filter((match) => group.playerIds.includes(match.pair[0]));
      expect(own).toHaveLength(3);
      expect(new Set(own.flatMap((match) => match.pair))).toEqual(new Set(group.playerIds));
      expect(new Set(own.map((match) => pairKey(match.pair))).size).toBe(3);
    }
  });

  it("keeps the cross-group assignment of a plan stable", () => {
    const plan = planGroups(players(18), mulberry32(2));
    const unit = groupUnits(plan).find((candidate) => candidate.length === 2);
    if (unit === undefined) {
      expect.unreachable("the 18-player plan holds a paired unit");
    }
    const crossOf = (): string[] =>
      unitMatches(unit)
        .filter((match) => match.cross)
        .map((match) => pairKey(match.pair));
    expect(crossOf()).toEqual(crossOf());
    expect(new Set(crossOf()).size).toBe(3);
  });

  it("refuses a group of the wrong size", () => {
    expect(() =>
      unitRoundPairs([{ label: "A", playerIds: ["a", "b", "c"], pairedWith: null }], 1),
    ).toThrow(/not a 4-player group/u);
    expect(() =>
      unitRoundPairs(
        [
          { label: "A", playerIds: ["a", "b", "c", "d"], pairedWith: "B" },
          { label: "B", playerIds: ["e", "f", "g"], pairedWith: "A" },
        ],
        1,
      ),
    ).toThrow(/not a 3-player group/u);
  });
});
