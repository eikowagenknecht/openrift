import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import type { GroupPlanGroup } from "./group-cut-types";
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
