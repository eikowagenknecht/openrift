import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import type {
  GroupMatch,
  GroupPlanGroup,
  GroupStandings,
  GroupStandingsInput,
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
  const counts = [16, 18, 20, 22, 24, 26, 28, 30, 32];

  function playAll(playerIds: string[]): {
    groups: GroupPlanGroup[];
    matches: GroupMatch[];
  } {
    const plan = planGroups(playerIds, mulberry32(playerIds.length));
    const matches: GroupMatch[] = [];
    for (const unit of groupUnits(plan)) {
      for (const round of [1, 2, 3] as const) {
        for (const { pair } of unitRoundPairs(unit, round)) {
          const [first, second] = pair;
          const firstWins = Number(first.slice(1)) < Number(second.slice(1));
          matches.push(firstWins ? win(first, second) : win(second, first));
        }
      }
    }
    return { groups: plan.groups, matches };
  }

  it.each(counts)("splits the cut into winners then runners-up for %i players", (count) => {
    const playerIds = Array.from({ length: count }, (_, index) => `p${index + 1}`);
    const { groups, matches } = playAll(playerIds);
    const result = computeGroupStage(standingsInput(groups, matches));

    expect(result.ranking).toHaveLength(count);
    const places = result.ranking.map((row) => row.place);
    expect(places).toEqual(places.toSorted((a, b) => a - b));

    const cut = result.ranking.slice(0, 8);
    const winners = cut.filter((row) => row.place === 1);
    expect(winners).toHaveLength(Math.min(groups.length, 8));
    expect(cut.map((row) => row.place)).toEqual([
      ...winners.map(() => 1),
      ...cut.slice(winners.length).map(() => 2),
    ]);
    expect(new Set(winners.map((row) => row.groupLabel)).size).toBe(winners.length);
    for (const standings of result.groups.slice(0, 8)) {
      expect(winners.map((row) => row.playerId)).toContain(standings.rows[0]?.playerId);
    }
  });

  it("gives every player three matches", () => {
    const playerIds = Array.from({ length: 18 }, (_, index) => `p${index + 1}`);
    const { groups, matches } = playAll(playerIds);
    const result = computeGroupStage(standingsInput(groups, matches));
    for (const playerId of playerIds) {
      expect(matches.filter((match) => match.playerIds.includes(playerId))).toHaveLength(3);
    }
    expect(result.groups.flatMap((standings) => standings.rows)).toHaveLength(18);
  });
});
