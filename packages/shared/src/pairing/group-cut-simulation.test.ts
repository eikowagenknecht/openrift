import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import { seedBracket } from "./cut-bracket";
import type {
  BracketSeed,
  CutSize,
  GroupMatch,
  GroupPlan,
  GroupStandingsInput,
  QualificationRow,
} from "./group-cut-types";
import { groupUnits, planGroups, unitRoundPairs } from "./group-stage";
import { computeGroupStage } from "./group-standings";

const FIELD_SIZES = Array.from({ length: 18 }, (_, index) => 6 + index * 2);
const SEEDS = [1, 2, 3];
const LEGENDS = ["yasuo", "viktor", "jinx", "lux", "garen"];
const SCORELINES: [number, number][] = [
  [2, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [1, 1],
];

function players(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`);
}

function alphabetical(playerId: string): number {
  let key = 0;
  for (const character of playerId) {
    key = key * 128 + (character.codePointAt(0) ?? 0);
  }
  return key;
}

function pickAt<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error(`pickAt: nothing at index ${index}`);
  }
  return item;
}

function resultOf(pair: readonly [string, string], roll: number, pick: number): GroupMatch {
  const [first, second] = pair;
  if (roll < 0.08) {
    const winner = pick % 2 === 0 ? first : second;
    const loser = winner === first ? second : first;
    return { playerIds: [winner, loser], placements: [1, 2], gamePoints: [null, null] };
  }
  const games = pickAt(SCORELINES, pick);
  const [firstGames, secondGames] = games;
  if (firstGames === secondGames) {
    return { playerIds: [first, second], placements: [1, 1], gamePoints: games };
  }
  return {
    playerIds: [first, second],
    placements: firstGames > secondGames ? [1, 2] : [2, 1],
    gamePoints: games,
  };
}

function cutSizeFor(count: number): CutSize {
  if (count >= 32) {
    return 16;
  }
  return count >= 16 ? 8 : 4;
}

interface Tournament {
  plan: GroupPlan;
  matches: GroupMatch[];
  input: GroupStandingsInput;
}

function generate(count: number, seed: number): Tournament {
  const rng = mulberry32(seed);
  const playerIds = players(count);
  const plan = planGroups(playerIds, rng);
  const matches: GroupMatch[] = [];
  for (const unit of groupUnits(plan)) {
    for (const round of [1, 2, 3] as const) {
      for (const { pair } of unitRoundPairs(unit, round)) {
        matches.push(resultOf(pair, rng.next(), Math.floor(rng.next() * SCORELINES.length)));
      }
    }
  }
  const legendByPlayer = new Map(
    playerIds.map((playerId) => [
      playerId,
      pickAt(LEGENDS, Math.floor(rng.next() * LEGENDS.length)),
    ]),
  );
  const metaShareByLegend = new Map(
    LEGENDS.map((legendId, index) => [legendId, (index + 1) * 1.5]),
  );
  return {
    plan,
    matches,
    input: {
      groups: plan.groups,
      matches,
      winPoints: 3,
      drawPoints: 1,
      legend: { legendByPlayer, metaShareByLegend },
      tieBreakKey: alphabetical,
    },
  };
}

function opponentsOf(matches: readonly GroupMatch[], playerId: string): string[] {
  return matches
    .filter((match) => match.playerIds.includes(playerId))
    .map((match) => (match.playerIds[0] === playerId ? match.playerIds[1] : match.playerIds[0]));
}

function seedAt(
  assignment: readonly number[],
  position: number,
  bySeed: ReadonlyMap<number, BracketSeed>,
): BracketSeed {
  const seed = assignment[position];
  const entry = seed === undefined ? undefined : bySeed.get(seed);
  if (entry === undefined) {
    throw new Error(`seedAt: no seed at bracket position ${position}`);
  }
  return entry;
}

function rematchCount(
  assignment: readonly number[],
  bySeed: ReadonlyMap<number, BracketSeed>,
): number {
  let count = 0;
  for (let slot = 0; slot * 2 < assignment.length; slot++) {
    const first = seedAt(assignment, slot * 2, bySeed);
    const second = seedAt(assignment, slot * 2 + 1, bySeed);
    if (first.opponentIds.includes(second.playerId)) {
      count++;
    }
  }
  return count;
}

function bestRematchCountAfterOneSwap(
  assignment: readonly number[],
  bySeed: ReadonlyMap<number, BracketSeed>,
): number {
  let best = rematchCount(assignment, bySeed);
  for (let i = 0; i < assignment.length - 1; i++) {
    for (let j = i + 1; j < assignment.length; j++) {
      const candidate = [...assignment];
      const atI = candidate[i];
      const atJ = candidate[j];
      if (atI === undefined || atJ === undefined) {
        continue;
      }
      candidate[i] = atJ;
      candidate[j] = atI;
      best = Math.min(best, rematchCount(candidate, bySeed));
    }
  }
  return best;
}

function expectGroupPlan(tournament: Tournament, count: number): void {
  const { plan } = tournament;
  const seated = plan.groups.flatMap((group) => group.playerIds);
  expect(seated.toSorted()).toEqual(players(count).toSorted());
  const threes = plan.groups.filter((group) => group.playerIds.length === 3);
  expect([0, 2]).toContain(threes.length);
  for (const group of plan.groups) {
    expect([3, 4]).toContain(group.playerIds.length);
    if (group.playerIds.length === 4) {
      expect(group.pairedWith).toBeNull();
      continue;
    }
    const partner = plan.groups.find((candidate) => candidate.label === group.pairedWith);
    expect(partner?.playerIds).toHaveLength(3);
    expect(partner?.pairedWith).toBe(group.label);
  }
}

function expectSchedule(tournament: Tournament, count: number): void {
  const { plan, matches } = tournament;
  const labelOf = new Map(
    plan.groups.flatMap((group) => group.playerIds.map((playerId) => [playerId, group.label])),
  );
  const sizeOf = new Map(
    plan.groups.flatMap((group) =>
      group.playerIds.map((playerId) => [playerId, group.playerIds.length]),
    ),
  );
  for (const playerId of players(count)) {
    const opponents = opponentsOf(matches, playerId);
    expect(opponents).toHaveLength(3);
    expect(opponents).not.toContain(playerId);
    expect(new Set(opponents).size).toBe(3);
    const own = plan.groups.find((group) => group.label === labelOf.get(playerId));
    const intra = opponents.filter((other) => labelOf.get(other) === labelOf.get(playerId));
    expect(intra).toHaveLength(sizeOf.get(playerId) === 4 ? 3 : 2);
    for (const cross of opponents.filter((other) => !intra.includes(other))) {
      expect(labelOf.get(cross)).toBe(own?.pairedWith);
    }
  }
}

function expectCut(tournament: Tournament, cutSize: CutSize): QualificationRow[] {
  const result = computeGroupStage(tournament.input);
  expect(result.pendingMetaLegendIds).toEqual([]);
  const places = result.ranking.map((row) => row.place);
  expect(places).toEqual(places.toSorted((a, b) => a - b));
  const cut = result.ranking.slice(0, cutSize);
  expect(cut).toHaveLength(cutSize);
  expect(new Set(cut.map((row) => row.playerId)).size).toBe(cutSize);
  return cut;
}

function expectBracket(tournament: Tournament, cut: readonly QualificationRow[]): void {
  const seeds: BracketSeed[] = cut.map((row, index) => ({
    seed: index + 1,
    playerId: row.playerId,
    groupLabel: row.groupLabel,
    opponentIds: opponentsOf(tournament.matches, row.playerId),
  }));
  expect(seeds.map((seed) => seed.seed)).toEqual(
    Array.from({ length: cut.length }, (_, index) => index + 1),
  );
  const bySeed = new Map(seeds.map((seed) => [seed.seed, seed]));
  const slots = seedBracket(seeds, { avoidRematches: true });

  expect(slots).toHaveLength(cut.length / 2);
  expect(slots.flatMap((slot) => slot.playerIds).toSorted()).toEqual(
    seeds.map((seed) => seed.playerId).toSorted(),
  );
  expect(slots.flatMap((slot) => [...slot.seeds]).toSorted((a, b) => a - b)).toEqual(
    seeds.map((seed) => seed.seed),
  );
  for (const slot of slots) {
    expect(slot.seeds[0]).toBeLessThan(slot.seeds[1]);
    expect(slot.playerIds[0]).toBe(bySeed.get(slot.seeds[0])?.playerId);
    expect(slot.playerIds[1]).toBe(bySeed.get(slot.seeds[1])?.playerId);
  }

  const assignment = slots.flatMap((slot) => [...slot.seeds]);
  expect(bestRematchCountAfterOneSwap(assignment, bySeed)).toBe(rematchCount(assignment, bySeed));
}

describe("group stage and top cut over generated tournaments", () => {
  it.each(FIELD_SIZES)("holds every invariant for %i players", (count) => {
    const cutSize = cutSizeFor(count);
    for (const seed of SEEDS) {
      const tournament = generate(count, seed);
      expectGroupPlan(tournament, count);
      expectSchedule(tournament, count);
      expectBracket(tournament, expectCut(tournament, cutSize));
    }
  });

  it("refuses every odd field size in the same range", () => {
    for (const count of FIELD_SIZES) {
      expect(() => planGroups(players(count + 1), mulberry32(count))).toThrow();
    }
  });
});
