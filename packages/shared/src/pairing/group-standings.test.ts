import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import type {
  GroupMatch,
  GroupPlanGroup,
  GroupStageRanking,
  GroupStandings,
  GroupStandingsInput,
  LegendTiebreakInput,
  QualificationRow,
} from "./group-cut-types";
import { groupUnits, planGroups, unitRoundPairs } from "./group-stage";
import { computeGroupStage, gameWinRate, matchWinRate } from "./group-standings";

function group(
  label: string,
  playerIds: string[],
  pairedWith: string | null = null,
): GroupPlanGroup {
  return { label, playerIds, pairedWith };
}

function win(winner: string, loser: string, games: [number, number] = [2, 0]): GroupMatch {
  return { playerIds: [winner, loser], placements: [1, 2], gamePoints: games };
}

function drew(first: string, second: string, games: [number, number] = [1, 1]): GroupMatch {
  return { playerIds: [first, second], placements: [1, 1], gamePoints: games };
}

function walkover(winner: string, dropped: string): GroupMatch {
  return { playerIds: [winner, dropped], placements: [1, 2], gamePoints: [null, null] };
}

function unreported(first: string, second: string): GroupMatch {
  return { playerIds: [first, second], placements: null, gamePoints: [null, null] };
}

function alphabetical(playerId: string): number {
  let key = 0;
  for (const character of playerId) {
    key = key * 128 + (character.codePointAt(0) ?? 0);
  }
  return key;
}

function standingsInput(
  groups: GroupPlanGroup[],
  matches: GroupMatch[],
  overrides: Partial<GroupStandingsInput> = {},
): GroupStandingsInput {
  return {
    groups,
    matches,
    winPoints: 3,
    drawPoints: 1,
    legend: null,
    tieBreakKey: alphabetical,
    ...overrides,
  };
}

function order(standings: GroupStandings | undefined): string[] {
  return (standings?.rows ?? []).map((row) => row.playerId);
}

function tiers(standings: GroupStandings | undefined): (string | null)[] {
  return (standings?.rows ?? []).map((row) => row.decidedBy);
}

function players(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`);
}

function placementsFor(first: number, second: number): [number, number] {
  if (first === second) {
    return [1, 1];
  }
  return first > second ? [1, 2] : [2, 1];
}

function scored(first: string, second: string, games: [number, number]): GroupMatch {
  return {
    playerIds: [first, second],
    placements: placementsFor(games[0], games[1]),
    gamePoints: games,
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  return items
    .map((item) => ({ item, key: rng.next() }))
    .toSorted((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}

const SCORELINES: [number, number][] = [
  [2, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [1, 1],
];

function scorelineAt(index: number): [number, number] {
  const games = SCORELINES[index % SCORELINES.length];
  if (games === undefined) {
    throw new Error(`scorelineAt: no scoreline at ${index}`);
  }
  return games;
}

function playedTournament(
  count: number,
  seed: number,
): { groups: GroupPlanGroup[]; matches: GroupMatch[] } {
  const rng = mulberry32(seed);
  const plan = planGroups(players(count), rng);
  const matches: GroupMatch[] = [];
  for (const unit of groupUnits(plan)) {
    for (const round of [1, 2, 3] as const) {
      for (const { pair } of unitRoundPairs(unit, round)) {
        const [first, second] = pair;
        if (rng.next() < 0.08) {
          matches.push(rng.next() < 0.5 ? walkover(first, second) : walkover(second, first));
          continue;
        }
        matches.push(
          scored(first, second, scorelineAt(Math.floor(rng.next() * SCORELINES.length))),
        );
      }
    }
  }
  return { groups: plan.groups, matches };
}

const heavyGroups = [
  group("A", ["a1", "a2", "a3", "a4"]),
  group("B", ["b1", "b2", "b3", "b4"]),
  group("C", ["c1", "c2", "c3", "c4"]),
  group("D", ["d1", "d2", "d3", "d4"]),
];

const heavyMatches = [
  win("a1", "a2"),
  win("a1", "a3"),
  win("a4", "a1"),
  win("a2", "a3"),
  win("a2", "a4"),
  win("a3", "a4"),
  win("b1", "b2"),
  win("b2", "b3"),
  win("b3", "b1", [2, 1]),
  win("b1", "b4"),
  win("b2", "b4"),
  win("b3", "b4"),
  drew("c1", "c2", [2, 0]),
  drew("c1", "c3", [2, 0]),
  drew("c1", "c4", [2, 0]),
  drew("c2", "c3"),
  drew("c2", "c4"),
  drew("c3", "c4"),
  drew("d1", "d2"),
  drew("d1", "d3"),
  drew("d1", "d4"),
  drew("d2", "d3"),
  drew("d2", "d4"),
  drew("d3", "d4"),
];

const heavyLegends: LegendTiebreakInput = {
  legendByPlayer: new Map([
    ["a1", "la1"],
    ["a2", "la2"],
    ["a3", "lcommon"],
    ["a4", "la4"],
    ["b1", "lb1"],
    ["b2", "lb2"],
    ["b3", "lcommon"],
    ["b4", "lb4"],
    ["c1", "lc1"],
    ["c2", "lcommon"],
    ["c3", "lc3"],
    ["c4", "lc4"],
    ["d1", "ldraw"],
    ["d2", "ldraw"],
    ["d3", "ldraw"],
    ["d4", "ldraw"],
  ]),
  metaShareByLegend: new Map([
    ["la1", 1],
    ["la2", 3],
    ["la4", 6],
    ["lb1", 2],
    ["lb2", 7],
    ["lb4", 8],
    ["lc1", 10],
    ["lc3", 5],
    ["lc4", 9],
    ["lcommon", 11],
    ["ldraw", 12],
  ]),
};

describe("matchWinRate and gameWinRate", () => {
  it("counts a draw as half a win", () => {
    expect(matchWinRate(2, 1, 3)).toBeCloseTo(5 / 6);
  });

  it("is zero without a reported match", () => {
    expect(matchWinRate(0, 0, 0)).toBe(0);
  });

  it("has no game win rate before a game is played", () => {
    expect(gameWinRate(0, 0)).toBeNull();
    expect(gameWinRate(3, 5)).toBeCloseTo(0.6);
  });
});

describe("computeGroupStage: points", () => {
  it("orders a group by match points", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [win("a", "b"), win("c", "d"), win("a", "c"), win("b", "d"), win("a", "d"), win("b", "c")],
      ),
    );
    expect(order(result.groups[0])).toEqual(["a", "b", "c", "d"]);
    expect(result.groups[0]?.rows.map((row) => row.points)).toEqual([9, 6, 3, 0]);
    expect(result.groups[0]?.rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
    expect(tiers(result.groups[0])).toEqual([null, null, null, null]);
  });

  it("counts wins, losses, draws and games", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          drew("a", "b"),
          win("c", "d", [2, 1]),
          win("a", "c"),
          win("b", "d"),
          win("a", "d"),
          win("b", "c"),
        ],
      ),
    );
    const rowA = result.groups[0]?.rows.find((row) => row.playerId === "a");
    expect(rowA).toMatchObject({
      points: 7,
      wins: 2,
      losses: 0,
      draws: 1,
      gamesWon: 5,
      gamesPlayed: 6,
    });
    expect(rowA?.gameWinRate).toBeCloseTo(5 / 6);
  });

  it("ignores an unreported match", () => {
    const result = computeGroupStage(
      standingsInput([group("A", ["a", "b", "c", "d"])], [win("a", "b"), unreported("c", "d")]),
    );
    const rowC = result.groups[0]?.rows.find((row) => row.playerId === "c");
    expect(rowC).toMatchObject({ points: 0, wins: 0, losses: 0, gamesPlayed: 0 });
    expect(result.ranking.find((row) => row.playerId === "c")?.matchWinRate).toBe(0);
  });
});

describe("computeGroupStage: two-player ties", () => {
  it("separates two tied players by head-to-head", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [win("b", "a"), win("c", "d"), win("a", "c"), win("d", "b"), win("a", "d"), win("b", "c")],
      ),
    );
    expect(order(result.groups[0])).toEqual(["b", "a", "c", "d"]);
    expect(tiers(result.groups[0])).toEqual([null, "h2h", null, "h2h"]);
  });

  it("falls to game win rate when the head-to-head was a draw", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          drew("a", "b"),
          win("c", "d"),
          win("a", "c", [2, 0]),
          win("b", "d", [2, 1]),
          win("a", "d", [2, 0]),
          win("b", "c", [2, 1]),
        ],
      ),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("gw");
    expect(result.groups[0]?.rows[0]?.gameWinRate).toBeCloseTo(5 / 6);
    expect(result.groups[0]?.rows[1]?.gameWinRate).toBeCloseTo(5 / 8);
  });

  it("compares game win rate over played games only, skipping walkovers", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          drew("a", "b"),
          win("c", "d"),
          walkover("a", "c"),
          win("b", "d"),
          walkover("a", "d"),
          win("b", "c"),
        ],
      ),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["b", "a"]);
    expect(result.groups[0]?.rows[1]?.gameWinRate).toBeCloseTo(0.5);
  });
});

describe("computeGroupStage: mini-table", () => {
  it("resolves a circular three-way tie by mini-table game win rate", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          win("a", "b", [2, 0]),
          win("b", "c", [2, 0]),
          win("c", "a", [2, 1]),
          win("a", "d", [2, 1]),
          win("b", "d", [2, 0]),
          win("c", "d", [2, 0]),
        ],
      ),
    );
    expect(order(result.groups[0])).toEqual(["a", "b", "c", "d"]);
    expect(tiers(result.groups[0])).toEqual([null, "mini_table", "mini_table", null]);
    const rows = result.groups[0]?.rows ?? [];
    expect(rows[0]?.gameWinRate).toBeCloseTo(5 / 8);
    expect(rows[1]?.gameWinRate).toBeCloseTo(4 / 6);
  });

  it("keeps a partial mini-table order and recurses into the rest", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("X", ["a", "b", "c", "d", "x", "y"])],
        [
          win("a", "b"),
          win("a", "c"),
          win("a", "d"),
          win("b", "c"),
          win("c", "d"),
          win("d", "b"),
          win("x", "a"),
          win("y", "a"),
          win("b", "x", [2, 0]),
          win("b", "y", [2, 0]),
          win("c", "x", [2, 1]),
          win("c", "y", [2, 0]),
          win("d", "x", [2, 1]),
          win("d", "y", [2, 1]),
        ],
      ),
    );
    expect(result.groups[0]?.rows.slice(0, 4).map((row) => row.points)).toEqual([9, 9, 9, 9]);
    expect(order(result.groups[0]).slice(0, 4)).toEqual(["a", "b", "c", "d"]);
    expect(tiers(result.groups[0]).slice(0, 4)).toEqual([null, "mini_table", "gw", "gw"]);
  });

  it("uses head-to-head inside a two-player subset the mini-table left tied", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("X", ["a", "b", "c", "d", "x", "y"])],
        [
          win("b", "a"),
          win("a", "c"),
          win("a", "d"),
          win("c", "b"),
          win("b", "d"),
          win("d", "c"),
          win("a", "x"),
          win("y", "a"),
          win("b", "x"),
          win("y", "b"),
          win("c", "x"),
          win("c", "y"),
          win("d", "x"),
          win("d", "y"),
        ],
      ),
    );
    expect(result.groups[0]?.rows.slice(0, 4).map((row) => row.points)).toEqual([9, 9, 9, 9]);
    expect(order(result.groups[0]).slice(0, 4)).toEqual(["b", "a", "d", "c"]);
    expect(tiers(result.groups[0]).slice(0, 4)).toEqual([null, "h2h", "mini_table", "h2h"]);
  });

  it("falls through to overall game win rate when the mini-table separates nobody", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("X", ["b", "c", "d", "x", "y"])],
        [
          drew("b", "c"),
          drew("b", "d"),
          drew("c", "d"),
          win("b", "x", [2, 0]),
          win("b", "y", [2, 0]),
          win("c", "x", [2, 1]),
          win("c", "y", [2, 0]),
          win("d", "x", [2, 1]),
          win("d", "y", [2, 1]),
        ],
      ),
    );
    expect(result.groups[0]?.rows.slice(0, 3).map((row) => row.points)).toEqual([8, 8, 8]);
    expect(order(result.groups[0]).slice(0, 3)).toEqual(["b", "c", "d"]);
    expect(tiers(result.groups[0]).slice(0, 3)).toEqual([null, "gw", "gw"]);
  });

  it("orders a group nobody separated by the tie-break key", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          drew("a", "b"),
          drew("c", "d"),
          drew("a", "c"),
          drew("b", "d"),
          drew("a", "d"),
          drew("b", "c"),
        ],
        { tieBreakKey: (playerId) => -alphabetical(playerId) },
      ),
    );
    expect(order(result.groups[0])).toEqual(["d", "c", "b", "a"]);
    expect(tiers(result.groups[0])).toEqual([null, "draw", "draw", "draw"]);
  });
});

describe("computeGroupStage: Legend tiers", () => {
  const legendGroup = [group("A", ["a", "b", "c", "d"])];
  const legendMatches = [
    drew("a", "b"),
    win("c", "d"),
    win("a", "c"),
    win("b", "d"),
    win("a", "d"),
    win("b", "c"),
  ];

  it("puts the rarer Legend in the field first", () => {
    const result = computeGroupStage(
      standingsInput(legendGroup, legendMatches, {
        legend: {
          legendByPlayer: new Map([
            ["a", "rare"],
            ["b", "common"],
            ["c", "common"],
            ["d", "common"],
          ]),
          metaShareByLegend: new Map(),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("legend_count");
  });

  it("ranks a missing Legend below a known one", () => {
    const result = computeGroupStage(
      standingsInput(legendGroup, legendMatches, {
        legend: {
          legendByPlayer: new Map([
            ["a", null],
            ["b", "common"],
            ["c", "common"],
            ["d", "common"],
          ]),
          metaShareByLegend: new Map(),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["b", "a"]);
    expect(tiers(result.groups[0])[1]).toBe("legend_count");
  });

  it("puts the lower meta share first once the counts are equal", () => {
    const result = computeGroupStage(
      standingsInput(legendGroup, legendMatches, {
        legend: {
          legendByPlayer: new Map([
            ["a", "yasuo"],
            ["b", "viktor"],
            ["c", "yasuo"],
            ["d", "viktor"],
          ]),
          metaShareByLegend: new Map([
            ["yasuo", 12.5],
            ["viktor", 4],
          ]),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["b", "a"]);
    expect(tiers(result.groups[0])[1]).toBe("meta_share");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });

  it("marks a tie waiting for a meta share and names the Legend", () => {
    const result = computeGroupStage(
      standingsInput(legendGroup, legendMatches, {
        legend: {
          legendByPlayer: new Map([
            ["a", "yasuo"],
            ["b", "viktor"],
            ["c", "yasuo"],
            ["d", "viktor"],
          ]),
          metaShareByLegend: new Map([["yasuo", 12.5]]),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("meta_pending");
    expect(result.pendingMetaLegendIds).toEqual(["viktor"]);
  });

  it("skips the Legend tiers when they are off", () => {
    const result = computeGroupStage(standingsInput(legendGroup, legendMatches));
    expect(tiers(result.groups[0])[1]).toBe("draw");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });
});

describe("computeGroupStage: walkovers", () => {
  it("counts a walkover for points and match win rate but not for games", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [
          walkover("a", "b"),
          win("c", "d", [2, 0]),
          win("a", "c", [2, 1]),
          walkover("b", "d"),
          win("a", "d", [2, 0]),
          win("b", "c", [2, 0]),
        ],
      ),
    );
    const rowA = result.groups[0]?.rows.find((row) => row.playerId === "a");
    expect(rowA).toMatchObject({ points: 9, wins: 3, losses: 0, gamesWon: 4, gamesPlayed: 5 });
    const rowB = result.groups[0]?.rows.find((row) => row.playerId === "b");
    expect(rowB).toMatchObject({ points: 6, wins: 2, losses: 1, gamesWon: 2, gamesPlayed: 2 });
    expect(result.ranking.find((row) => row.playerId === "a")?.matchWinRate).toBe(1);
    expect(result.ranking.find((row) => row.playerId === "b")?.matchWinRate).toBeCloseTo(2 / 3);
  });

  it("treats a walkover draw as a draw for both", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [{ playerIds: ["a", "b"], placements: [1, 1], gamePoints: [null, null] }],
      ),
    );
    const rowA = result.groups[0]?.rows.find((row) => row.playerId === "a");
    expect(rowA).toMatchObject({ points: 1, draws: 1, gamesPlayed: 0 });
    expect(rowA?.gameWinRate).toBeNull();
  });
});

describe("computeGroupStage: cross-group matches", () => {
  const groups = [group("D", ["d1", "d2", "d3"], "E"), group("E", ["e1", "e2", "e3"], "D")];
  const matches = [
    win("e1", "d1"),
    win("d2", "d3"),
    win("e2", "e3"),
    win("d2", "e2"),
    win("d1", "d3"),
    win("e1", "e3"),
    win("d3", "e3"),
    win("d1", "d2"),
    win("e1", "e2"),
  ];

  it("leaves the cross-group match out of the group placement", () => {
    const result = computeGroupStage(standingsInput(groups, matches));
    const rowD1 = result.groups[0]?.rows[0];
    expect(rowD1).toMatchObject({ playerId: "d1", points: 6, wins: 2, losses: 0, gamesPlayed: 4 });
    expect(order(result.groups[0])).toEqual(["d1", "d2", "d3"]);
  });

  it("counts the cross-group match in the ranking match win rate", () => {
    const result = computeGroupStage(standingsInput(groups, matches));
    expect(result.ranking.find((row) => row.playerId === "d1")?.matchWinRate).toBeCloseTo(2 / 3);
    expect(result.ranking.find((row) => row.playerId === "e1")?.matchWinRate).toBe(1);
  });

  it("orders one placement tier by match win rate", () => {
    const result = computeGroupStage(standingsInput(groups, matches));
    const firsts = result.ranking.filter((row) => row.place === 1);
    expect(firsts.map((row) => row.playerId)).toEqual(["e1", "d1"]);
    expect(firsts[1]?.decidedBy).toBe("mw");
  });
});

describe("computeGroupStage: cross-group ranking", () => {
  it("puts every group winner above every runner-up", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a1", "a2", "a3", "a4"]), group("B", ["b1", "b2", "b3", "b4"])],
        [
          win("a1", "a2"),
          win("a3", "a4"),
          win("a1", "a3"),
          win("a2", "a4"),
          win("a1", "a4"),
          win("a2", "a3"),
          win("b1", "b2"),
          win("b3", "b4"),
          drew("b1", "b3"),
          drew("b2", "b4"),
          win("b4", "b1"),
          win("b2", "b3"),
        ],
      ),
    );
    expect(result.groups[1]?.rows.map((row) => row.points)).toEqual([4, 4, 4, 4]);
    const winners = result.ranking.filter((row) => row.place === 1);
    expect(winners.map((row) => row.groupLabel)).toEqual(["A", "B"]);
    expect(winners[1]?.matchWinRate).toBeCloseTo(0.5);
    const runnerUp = result.ranking.find((row) => row.playerId === "a2");
    expect(runnerUp?.matchWinRate).toBeCloseTo(2 / 3);
    expect(result.ranking.slice(0, 2).map((row) => row.place)).toEqual([1, 1]);
    expect(result.ranking.findIndex((row) => row.playerId === "a2")).toBeGreaterThan(1);
  });

  it("falls to game win rate when the match win rates are equal", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a1", "a2", "a3", "a4"]), group("B", ["b1", "b2", "b3", "b4"])],
        [
          win("a1", "a2", [2, 0]),
          win("a1", "a3", [2, 0]),
          win("a1", "a4", [2, 0]),
          win("a2", "a3"),
          win("a2", "a4"),
          win("a3", "a4"),
          win("b1", "b2", [2, 1]),
          win("b1", "b3", [2, 1]),
          win("b1", "b4", [2, 1]),
          win("b2", "b3"),
          win("b2", "b4"),
          win("b3", "b4"),
        ],
      ),
    );
    const firsts = result.ranking.filter((row) => row.place === 1);
    expect(firsts.map((row) => row.matchWinRate)).toEqual([1, 1]);
    expect(firsts.map((row) => row.playerId)).toEqual(["a1", "b1"]);
    expect(firsts[1]?.decidedBy).toBe("gw");
  });

  it("marks the placement change with no tier", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a1", "a2", "a3", "a4"])],
        [
          win("a1", "a2"),
          win("a3", "a4"),
          win("a1", "a3"),
          win("a2", "a4"),
          win("a1", "a4"),
          win("a2", "a3"),
        ],
      ),
    );
    expect(result.ranking.map((row) => row.decidedBy)).toEqual([null, null, null, null]);
  });
});

describe("computeGroupStage: qualification for a top 8", () => {
  it("gives every player three matches", () => {
    const { groups, matches } = playedTournament(18, 18);
    const result = computeGroupStage(standingsInput(groups, matches));
    for (const playerId of players(18)) {
      expect(matches.filter((match) => match.playerIds.includes(playerId))).toHaveLength(3);
    }
    expect(result.groups.flatMap((standings) => standings.rows)).toHaveLength(18);
  });
});

describe("computeGroupStage: game aggregation", () => {
  const aggregations: [label: string, games: [number, number], won: number, played: number][] = [
    ["2:0", [2, 0], 2, 2],
    ["2:1", [2, 1], 2, 3],
    ["1:2", [1, 2], 1, 3],
    ["0:2", [0, 2], 0, 2],
    ["1:0", [1, 0], 1, 1],
    ["1:1", [1, 1], 1, 2],
  ];

  it.each(aggregations)("counts a %s match", (_label, games, won, played) => {
    const result = computeGroupStage(
      standingsInput([group("A", ["a", "b"])], [scored("a", "b", games)]),
    );
    const rowA = result.groups[0]?.rows.find((row) => row.playerId === "a");
    expect(rowA).toMatchObject({ gamesWon: won, gamesPlayed: played });
    expect(rowA?.gameWinRate).toBeCloseTo(won / played);
  });

  it("adds the games of every match into one rate", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a", "b", "c", "d"])],
        [scored("a", "b", [2, 0]), scored("a", "c", [2, 1]), scored("a", "d", [0, 2])],
      ),
    );
    const rowA = result.groups[0]?.rows.find((row) => row.playerId === "a");
    expect(rowA).toMatchObject({ gamesWon: 4, gamesPlayed: 7 });
    expect(rowA?.gameWinRate).toBeCloseTo(4 / 7);
  });
});

describe("computeGroupStage: match scope", () => {
  const scopeGroups = [
    group("A", ["a1", "a2", "a3", "a4"]),
    group("C", ["c1", "c2", "c3"], "D"),
    group("D", ["d1", "d2", "d3"], "C"),
  ];
  const scopeMatches = [
    win("a1", "a2", [2, 1]),
    win("a3", "a4"),
    win("a1", "a3"),
    win("a2", "a4"),
    win("a1", "a4"),
    win("a2", "a3"),
    win("c1", "c2"),
    win("c1", "c3"),
    win("c2", "c3"),
    win("d1", "d2", [2, 1]),
    win("d1", "d3"),
    win("d2", "d3"),
    win("c1", "d1"),
    win("d2", "c2"),
    win("c3", "d3"),
  ];
  const expectedRates: [playerId: string, matchRate: number, gameRate: number][] = [
    ["a1", 1, 6 / 7],
    ["a2", 2 / 3, 5 / 7],
    ["a3", 1 / 3, 1 / 3],
    ["a4", 0, 0],
    ["c1", 1, 1],
    ["c2", 1 / 3, 1 / 3],
    ["c3", 1 / 3, 1 / 3],
    ["d1", 2 / 3, 4 / 7],
    ["d2", 2 / 3, 5 / 7],
    ["d3", 0, 0],
  ];

  it("counts all three matches of a 4-player group in the group and in the ranking", () => {
    const result = computeGroupStage(standingsInput(scopeGroups, scopeMatches));
    expect(result.groups[0]?.rows[0]).toMatchObject({
      playerId: "a1",
      points: 9,
      wins: 3,
      gamesWon: 6,
      gamesPlayed: 7,
    });
    const ranked = result.ranking.find((row) => row.playerId === "a1");
    expect(ranked?.matchWinRate).toBe(1);
    expect(ranked?.gameWinRate).toBeCloseTo(6 / 7);
  });

  it("counts a paired group's cross match for the ranking rates only", () => {
    const result = computeGroupStage(standingsInput(scopeGroups, scopeMatches));
    expect(result.groups[1]?.rows[0]).toMatchObject({
      playerId: "c1",
      points: 6,
      wins: 2,
      gamesPlayed: 4,
    });
    const ranked = result.ranking.find((row) => row.playerId === "c1");
    expect(ranked?.matchWinRate).toBe(1);
    expect(ranked?.gameWinRate).toBe(1);
  });

  it.each(expectedRates)(
    "puts %s on the same three-match scale in both group structures",
    (playerId, expectedMatchRate, expectedGameRate) => {
      const result = computeGroupStage(standingsInput(scopeGroups, scopeMatches));
      expect(scopeMatches.filter((match) => match.playerIds.includes(playerId))).toHaveLength(3);
      const ranked = result.ranking.find((row) => row.playerId === playerId);
      expect(ranked?.matchWinRate).toBeCloseTo(expectedMatchRate);
      expect(ranked?.gameWinRate).toBeCloseTo(expectedGameRate);
    },
  );

  it("leaves every placement on differing points undecided by a tiebreak", () => {
    const result = computeGroupStage(standingsInput(scopeGroups, scopeMatches));
    expect(order(result.groups[0])).toEqual(["a1", "a2", "a3", "a4"]);
    expect(order(result.groups[1])).toEqual(["c1", "c2", "c3"]);
    expect(order(result.groups[2])).toEqual(["d1", "d2", "d3"]);
    for (const standings of result.groups) {
      expect(tiers(standings)).toEqual(standings.rows.map(() => null));
    }
  });
});

describe("computeGroupStage: stopping at each tie tier", () => {
  const tieGroup = [group("A", ["a", "b", "c", "d"])];

  function drawnHeadToHead(bGames: [number, number]): GroupMatch[] {
    return [
      drew("a", "b"),
      win("a", "c"),
      win("a", "d"),
      win("b", "c", bGames),
      win("b", "d", bGames),
      win("c", "d"),
    ];
  }

  const rareForA: LegendTiebreakInput = {
    legendByPlayer: new Map([
      ["a", "rare"],
      ["b", "common"],
      ["c", "common"],
      ["d", "common"],
    ]),
    metaShareByLegend: new Map(),
  };

  it("stops at the head-to-head and reaches no Legend tier", () => {
    const result = computeGroupStage(
      standingsInput(
        tieGroup,
        [win("a", "b"), win("a", "c"), win("d", "a"), win("b", "c"), win("b", "d"), win("c", "d")],
        { legend: rareForA },
      ),
    );
    expect(order(result.groups[0])).toEqual(["a", "b", "c", "d"]);
    expect(tiers(result.groups[0])).toEqual([null, "h2h", null, "h2h"]);
    expect(result.pendingMetaLegendIds).toEqual([]);
  });

  it("stops at the game win rate and counts no Legend", () => {
    const result = computeGroupStage(
      standingsInput(tieGroup, drawnHeadToHead([2, 1]), {
        legend: {
          legendByPlayer: new Map([
            ["a", "common"],
            ["b", "rare"],
            ["c", "common"],
            ["d", "common"],
          ]),
          metaShareByLegend: new Map(),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("gw");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });

  it("stops at the Legend count and asks for no meta share", () => {
    const result = computeGroupStage(
      standingsInput(tieGroup, drawnHeadToHead([2, 0]), { legend: rareForA }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("legend_count");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });

  it("reaches the draw once every tier is equal for the two of them", () => {
    const result = computeGroupStage(
      standingsInput(tieGroup, drawnHeadToHead([2, 0]), {
        legend: {
          legendByPlayer: new Map([
            ["a", "same"],
            ["b", "same"],
            ["c", "same"],
            ["d", "same"],
          ]),
          metaShareByLegend: new Map([["same", 8]]),
        },
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a", "b"]);
    expect(tiers(result.groups[0])[1]).toBe("draw");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });
});

describe("computeGroupStage: mini-table scope and fallback", () => {
  const stalledGroup = [group("X", ["b", "c", "d", "x", "y"])];
  const stalledMatches = [
    drew("b", "c"),
    drew("b", "d"),
    drew("c", "d"),
    win("b", "x"),
    win("b", "y"),
    win("c", "x"),
    win("c", "y"),
    win("d", "x"),
    win("d", "y"),
  ];

  it("ignores the tied players' matches against the rest of the group", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("X", ["a", "b", "c", "x", "y"])],
        [
          win("a", "b"),
          win("b", "c"),
          win("c", "a", [2, 1]),
          win("a", "x", [2, 1]),
          win("a", "y", [2, 1]),
          win("b", "x"),
          win("b", "y"),
          win("c", "x"),
          win("c", "y"),
          win("x", "y"),
        ],
      ),
    );
    const rows = result.groups[0]?.rows ?? [];
    expect(rows.slice(0, 3).map((row) => row.points)).toEqual([9, 9, 9]);
    expect(order(result.groups[0]).slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(tiers(result.groups[0]).slice(0, 3)).toEqual([null, "mini_table", "mini_table"]);
    const overall = new Map(rows.map((row) => [row.playerId, row.gameWinRate ?? 0]));
    expect(overall.get("b") ?? 0).toBeGreaterThan(overall.get("a") ?? 0);
  });

  it("falls from a mini-table that separates nobody to the Legend tiers", () => {
    const result = computeGroupStage(
      standingsInput(stalledGroup, stalledMatches, {
        legend: {
          legendByPlayer: new Map([
            ["b", "lb"],
            ["c", "lc"],
            ["d", "ld"],
            ["x", "ld"],
            ["y", "ly"],
          ]),
          metaShareByLegend: new Map([
            ["lb", 4],
            ["lc", 9],
            ["ld", 2],
            ["ly", 3],
          ]),
        },
      }),
    );
    const rows = result.groups[0]?.rows ?? [];
    expect(rows.slice(0, 3).map((row) => row.points)).toEqual([8, 8, 8]);
    expect(rows.slice(0, 3).map((row) => row.gameWinRate)).toEqual([0.75, 0.75, 0.75]);
    expect(order(result.groups[0]).slice(0, 3)).toEqual(["b", "c", "d"]);
    expect(tiers(result.groups[0]).slice(0, 3)).toEqual([null, "meta_share", "legend_count"]);
  });

  it("falls to the draw when the Legend tiers are off and nothing separates the set", () => {
    const result = computeGroupStage(standingsInput(stalledGroup, stalledMatches));
    expect(order(result.groups[0]).slice(0, 3)).toEqual(["b", "c", "d"]);
    expect(tiers(result.groups[0]).slice(0, 3)).toEqual([null, "draw", "draw"]);
  });
});

describe("computeGroupStage: Legend identity across the field", () => {
  const identityGroups = [
    group("A", ["a1", "a2", "a3", "a4"]),
    group("B", ["b1", "b2", "b3", "b4"]),
  ];
  const identityMatches = [
    drew("a1", "a2"),
    win("a1", "a3"),
    win("a1", "a4"),
    win("a2", "a3"),
    win("a2", "a4"),
    win("a3", "a4"),
    win("b1", "b2"),
    win("b1", "b3"),
    win("b1", "b4"),
    win("b2", "b3"),
    win("b2", "b4"),
    win("b3", "b4"),
  ];

  function identityLegends(a1: string, a2: string): LegendTiebreakInput {
    return {
      legendByPlayer: new Map([
        ["a1", a1],
        ["a2", a2],
        ["a3", "afiller"],
        ["a4", "afiller"],
        ["b1", "shared"],
        ["b2", "shared"],
        ["b3", "shared"],
        ["b4", "bfiller"],
      ]),
      metaShareByLegend: new Map([
        ["solo", 6],
        ["shared", 3],
        ["afiller", 1],
        ["bfiller", 2],
      ]),
    };
  }

  it("counts a Legend across every group, not only the tied one", () => {
    const result = computeGroupStage(
      standingsInput(identityGroups, identityMatches, {
        legend: identityLegends("solo", "shared"),
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a1", "a2"]);
    expect(tiers(result.groups[0])[1]).toBe("legend_count");
  });

  it("counts two players on the same Legend id as one identity", () => {
    const result = computeGroupStage(
      standingsInput(identityGroups, identityMatches, {
        legend: identityLegends("shared", "shared"),
      }),
    );
    expect(order(result.groups[0]).slice(0, 2)).toEqual(["a1", "a2"]);
    expect(tiers(result.groups[0])[1]).toBe("draw");
  });

  it("names no Legend tier anywhere once they are off", () => {
    const result = computeGroupStage(standingsInput(heavyGroups, heavyMatches));
    const decided = [
      ...result.groups.flatMap((standings) => standings.rows.map((row) => row.decidedBy)),
      ...result.ranking.map((row) => row.decidedBy),
    ];
    expect(decided).not.toContain("legend_count");
    expect(decided).not.toContain("meta_share");
    expect(decided).not.toContain("meta_pending");
    expect(result.pendingMetaLegendIds).toEqual([]);
  });
});

describe("computeGroupStage: repeated calculation", () => {
  const { groups, matches } = playedTournament(18, 42);

  it("returns the same standings when the same input is computed twice", () => {
    const first = computeGroupStage(standingsInput(groups, matches));
    const second = computeGroupStage(standingsInput(groups, matches));
    expect(second).toEqual(first);
  });

  it("returns the same standings when the input order is shuffled", () => {
    const first = computeGroupStage(standingsInput(groups, matches));
    const shuffledGroups = shuffled(
      groups.map((entry) => ({ ...entry, playerIds: shuffled(entry.playerIds, 5) })),
      7,
    );
    const second = computeGroupStage(standingsInput(shuffledGroups, shuffled(matches, 9)));
    expect(second.ranking).toEqual(first.ranking);
    for (const standings of first.groups) {
      const same = second.groups.find((candidate) => candidate.label === standings.label);
      expect(same?.rows).toEqual(standings.rows);
    }
  });
});

describe("computeGroupStage: what the qualification ranking ignores", () => {
  it("never lets a runner-up pass a group winner with a worse match win rate", () => {
    const result = computeGroupStage(
      standingsInput(
        [group("A", ["a1", "a2"]), group("B", ["b1", "b2", "b3", "b4"])],
        [
          unreported("a1", "a2"),
          win("a2", "b1"),
          win("a2", "b2"),
          win("a2", "b3"),
          win("a1", "b4"),
          win("b1", "a1"),
          win("b2", "a1"),
          win("b1", "b2"),
          win("b1", "b3"),
          win("b1", "b4"),
          win("b2", "b3"),
          win("b2", "b4"),
          win("b3", "b4"),
        ],
      ),
    );
    const winners = result.ranking.filter((row) => row.place === 1);
    expect(winners.map((row) => row.playerId)).toEqual(["b1", "a1"]);
    expect(result.ranking.find((row) => row.playerId === "a1")?.matchWinRate).toBeCloseTo(1 / 3);
    const runnerUp = result.ranking.find((row) => row.playerId === "a2");
    expect(runnerUp?.place).toBe(2);
    expect(runnerUp?.matchWinRate).toBe(1);
    expect(result.ranking.findIndex((row) => row.playerId === "a2")).toBeGreaterThan(
      winners.length - 1,
    );
  });

  it("ignores an opponent's other results", () => {
    const groups = [group("A", ["a1", "a2", "a3", "a4"]), group("B", ["b1", "b2", "b3", "b4"])];
    const shared = [
      win("a1", "a2"),
      win("a1", "a3"),
      win("a1", "a4"),
      win("a2", "a3"),
      win("a2", "a4"),
      win("b1", "b2"),
      win("b1", "b3"),
      win("b1", "b4"),
      win("b2", "b3"),
      win("b2", "b4"),
      win("b3", "b4"),
    ];
    const first = computeGroupStage(standingsInput(groups, [...shared, win("a3", "a4")]));
    const second = computeGroupStage(standingsInput(groups, [...shared, win("a4", "a3", [2, 1])]));
    const winnersOf = (result: GroupStageRanking): QualificationRow[] =>
      result.ranking.filter((row) => row.place === 1);
    expect(winnersOf(second)).toEqual(winnersOf(first));
    expect(winnersOf(first).map((row) => row.playerId)).toEqual(["a1", "b1"]);
  });

  it("does not reward more 2:0 wins when the rates are equal", () => {
    const groups = [group("A", ["a1", "a2", "a3", "a4"]), group("B", ["b1", "b2", "b3", "b4"])];
    const matches = [
      win("a1", "a2"),
      win("a1", "a3"),
      walkover("a1", "a4"),
      win("b1", "b2"),
      win("b1", "b3"),
      win("b1", "b4"),
    ];
    const result = computeGroupStage(standingsInput(groups, matches));
    const winners = result.ranking.filter((row) => row.place === 1);
    expect(winners.map((row) => row.matchWinRate)).toEqual([1, 1]);
    expect(winners.map((row) => row.gameWinRate)).toEqual([1, 1]);
    expect(winners.map((row) => row.playerId)).toEqual(["a1", "b1"]);
    expect(winners[1]?.decidedBy).toBe("draw");

    const reversed = computeGroupStage(
      standingsInput(groups, matches, { tieBreakKey: (playerId) => -alphabetical(playerId) }),
    );
    const reversedWinners = reversed.ranking.filter((row) => row.place === 1);
    expect(reversedWinners.map((row) => row.playerId)).toEqual(["b1", "a1"]);
    expect(reversedWinners[1]?.decidedBy).toBe("draw");
  });
});

describe("computeGroupStage: the exact top 8", () => {
  const cutShapes: [count: number, winners: number, runnersUp: number][] = [
    [16, 4, 4],
    [18, 5, 3],
    [20, 5, 3],
    [22, 6, 2],
    [24, 6, 2],
    [26, 7, 1],
    [28, 7, 1],
    [30, 8, 0],
    [32, 8, 0],
  ];

  it.each(cutShapes)(
    "cuts %i players to %i group winners and %i runners-up",
    (count, winners, runnersUp) => {
      for (const seed of [1, 2, 3]) {
        const { groups, matches } = playedTournament(count, seed);
        const result = computeGroupStage(standingsInput(groups, matches));
        const cut = result.ranking.slice(0, 8);
        expect(result.ranking).toHaveLength(count);
        expect(cut).toHaveLength(8);
        expect(new Set(cut.map((row) => row.playerId)).size).toBe(8);
        expect(cut.filter((row) => row.place === 1)).toHaveLength(winners);
        expect(cut.filter((row) => row.place === 2)).toHaveLength(runnersUp);
        expect(new Set(cut.slice(0, winners).map((row) => row.groupLabel)).size).toBe(winners);
        for (const standings of result.groups) {
          expect(cut.map((row) => row.playerId)).toContain(standings.rows[0]?.playerId);
        }
        const places = result.ranking.map((row) => row.place);
        expect(places).toEqual(places.toSorted((a, b) => a - b));
      }
    },
  );
});

describe("computeGroupStage: a tiebreak-heavy tournament", () => {
  it("orders every group by the tier that separated the rows", () => {
    const result = computeGroupStage(
      standingsInput(heavyGroups, heavyMatches, { legend: heavyLegends }),
    );
    expect(order(result.groups[0])).toEqual(["a1", "a2", "a3", "a4"]);
    expect(tiers(result.groups[0])).toEqual([null, "h2h", null, "h2h"]);
    expect(order(result.groups[1])).toEqual(["b1", "b2", "b3", "b4"]);
    expect(tiers(result.groups[1])).toEqual([null, "mini_table", "mini_table", null]);
    expect(order(result.groups[2])).toEqual(["c1", "c3", "c4", "c2"]);
    expect(tiers(result.groups[2])).toEqual([null, "mini_table", "meta_share", "legend_count"]);
    expect(order(result.groups[3])).toEqual(["d1", "d2", "d3", "d4"]);
    expect(tiers(result.groups[3])).toEqual([null, "draw", "draw", "draw"]);
  });

  it("qualifies the exact top 8 in the exact order", () => {
    const result = computeGroupStage(
      standingsInput(heavyGroups, heavyMatches, { legend: heavyLegends }),
    );
    const cut = result.ranking.slice(0, 8);
    expect(cut.map((row) => row.playerId)).toEqual([
      "b1",
      "a1",
      "c1",
      "d1",
      "a2",
      "b2",
      "d2",
      "c3",
    ]);
    expect(cut.map((row) => row.place)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(cut.map((row) => row.decidedBy)).toEqual([
      null,
      "gw",
      "mw",
      "gw",
      null,
      "meta_share",
      "mw",
      "gw",
    ]);
    expect(result.pendingMetaLegendIds).toEqual([]);
  });
});
