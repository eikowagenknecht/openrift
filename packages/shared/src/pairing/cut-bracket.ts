import { CUT_SIZES } from "./group-cut-types.js";
import type { BracketSeed, BracketSlot, CutSize } from "./group-cut-types.js";

const CONVENTIONAL: Record<CutSize, readonly (readonly [number, number])[]> = {
  4: [
    [1, 4],
    [2, 3],
  ],
  8: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
  16: [
    [1, 16],
    [8, 9],
    [4, 13],
    [5, 12],
    [2, 15],
    [7, 10],
    [3, 14],
    [6, 11],
  ],
};

const EXHAUSTIVE_LIMIT = 8;

export function conventionalBracket(cutSize: CutSize): [number, number][] {
  return CONVENTIONAL[cutSize].map(([first, second]) => [first, second]);
}

function isCutSize(count: number): count is CutSize {
  return CUT_SIZES.some((size) => size === count);
}

interface Cost {
  rematches: number;
  sameGroup: number;
  imbalance: number;
  displaced: number;
}

function compareCost(a: Cost, b: Cost): number {
  if (a.rematches !== b.rematches) {
    return a.rematches - b.rematches;
  }
  if (a.sameGroup !== b.sameGroup) {
    return a.sameGroup - b.sameGroup;
  }
  if (a.imbalance !== b.imbalance) {
    return a.imbalance - b.imbalance;
  }
  return a.displaced - b.displaced;
}

function compareVector(a: readonly number[], b: readonly number[]): number {
  for (const [index, value] of a.entries()) {
    const other = b[index];
    if (other === undefined) {
      return 1;
    }
    if (value !== other) {
      return value - other;
    }
  }
  return 0;
}

function seedAt(
  assignment: readonly number[],
  position: number,
  bySeed: ReadonlyMap<number, BracketSeed>,
): BracketSeed {
  const seed = assignment[position];
  const entry = seed === undefined ? undefined : bySeed.get(seed);
  if (entry === undefined) {
    throw new Error(`seedBracket: no seed at bracket position ${position}`);
  }
  return entry;
}

function costOf(
  assignment: readonly number[],
  bySeed: ReadonlyMap<number, BracketSeed>,
  conventional: readonly number[],
): Cost {
  const balancedSum = assignment.length + 1;
  let rematches = 0;
  let imbalance = 0;
  for (let slot = 0; slot * 2 < assignment.length; slot++) {
    const first = seedAt(assignment, slot * 2, bySeed);
    const second = seedAt(assignment, slot * 2 + 1, bySeed);
    if (first.opponentIds.includes(second.playerId)) {
      rematches++;
    }
    imbalance += Math.abs(first.seed + second.seed - balancedSum);
  }
  let sameGroup = 0;
  for (let pair = 0; pair * 4 < assignment.length; pair++) {
    for (const left of [pair * 4, pair * 4 + 1]) {
      for (const right of [pair * 4 + 2, pair * 4 + 3]) {
        if (
          seedAt(assignment, left, bySeed).groupLabel ===
          seedAt(assignment, right, bySeed).groupLabel
        ) {
          sameGroup++;
        }
      }
    }
  }
  let displaced = 0;
  for (const [position, seed] of assignment.entries()) {
    if (conventional[position] !== seed) {
      displaced++;
    }
  }
  return { rematches, sameGroup, imbalance, displaced };
}

function* permutations(values: readonly number[]): Generator<number[]> {
  if (values.length === 0) {
    yield [];
    return;
  }
  for (const [index, value] of values.entries()) {
    const rest = values.filter((_, other) => other !== index);
    for (const tail of permutations(rest)) {
      yield [value, ...tail];
    }
  }
}

function exhaustive(
  conventional: readonly number[],
  cost: (a: readonly number[]) => Cost,
): number[] {
  const ascending = conventional.toSorted((a, b) => a - b);
  let best: number[] = [...conventional];
  let bestCost = cost(best);
  for (const candidate of permutations(ascending)) {
    const candidateCost = cost(candidate);
    const byCost = compareCost(candidateCost, bestCost);
    if (byCost < 0 || (byCost === 0 && compareVector(candidate, best) < 0)) {
      best = candidate;
      bestCost = candidateCost;
    }
  }
  return best;
}

function descendFrom(start: readonly number[], cost: (a: readonly number[]) => Cost): number[] {
  let current = [...start];
  let currentCost = cost(current);
  for (;;) {
    let best: number[] | null = null;
    let bestCost = currentCost;
    for (let i = 0; i < current.length - 1; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const candidate = [...current];
        const atI = candidate[i];
        const atJ = candidate[j];
        if (atI === undefined || atJ === undefined) {
          continue;
        }
        candidate[i] = atJ;
        candidate[j] = atI;
        const candidateCost = cost(candidate);
        const byCost = compareCost(candidateCost, bestCost);
        if (byCost < 0 || (byCost === 0 && best !== null && compareVector(candidate, best) < 0)) {
          best = candidate;
          bestCost = candidateCost;
        }
      }
    }
    if (best === null) {
      return current;
    }
    current = best;
    currentCost = bestCost;
  }
}

function isPerfect(cost: Cost): boolean {
  return cost.rematches === 0 && cost.sameGroup === 0 && cost.imbalance === 0;
}

// Top 16 descends by best cost-improving swap from the conventional bracket and from each of its
// single transpositions, because one descent stalls far above the reachable balance.
function swapDescent(
  conventional: readonly number[],
  cost: (a: readonly number[]) => Cost,
): number[] {
  let best = descendFrom(conventional, cost);
  let bestCost = cost(best);
  if (isPerfect(bestCost)) {
    return best;
  }
  for (let i = 0; i < conventional.length - 1; i++) {
    for (let j = i + 1; j < conventional.length; j++) {
      const start = [...conventional];
      const atI = start[i];
      const atJ = start[j];
      if (atI === undefined || atJ === undefined) {
        continue;
      }
      start[i] = atJ;
      start[j] = atI;
      const candidate = descendFrom(start, cost);
      const candidateCost = cost(candidate);
      const byCost = compareCost(candidateCost, bestCost);
      if (byCost < 0 || (byCost === 0 && compareVector(candidate, best) < 0)) {
        best = candidate;
        bestCost = candidateCost;
      }
    }
  }
  return best;
}

function canonicalize(assignment: readonly number[]): number[] {
  const ordered = [...assignment];
  for (let slot = 0; slot * 2 < ordered.length; slot++) {
    const first = ordered[slot * 2];
    const second = ordered[slot * 2 + 1];
    if (first !== undefined && second !== undefined && second < first) {
      ordered[slot * 2] = second;
      ordered[slot * 2 + 1] = first;
    }
  }
  return ordered;
}

export function seedBracket(
  seeds: readonly BracketSeed[],
  options: { avoidRematches: boolean },
): BracketSlot[] {
  if (!isCutSize(seeds.length)) {
    throw new Error(
      `seedBracket: a cut holds ${CUT_SIZES.join(", ")} players, got ${seeds.length}`,
    );
  }
  const bySeed = new Map(seeds.map((seed) => [seed.seed, seed]));
  const conventional = conventionalBracket(seeds.length).flat();
  for (const seed of conventional) {
    if (!bySeed.has(seed)) {
      throw new Error(`seedBracket: seed ${seed} is missing from the cut`);
    }
  }
  const cost = (assignment: readonly number[]): Cost => costOf(assignment, bySeed, conventional);
  let assignment = conventional;
  if (options.avoidRematches) {
    assignment =
      seeds.length <= EXHAUSTIVE_LIMIT
        ? exhaustive(conventional, cost)
        : swapDescent(conventional, cost);
  }
  const ordered = canonicalize(assignment);
  const slots: BracketSlot[] = [];
  for (let slot = 0; slot * 2 < ordered.length; slot++) {
    const first = seedAt(ordered, slot * 2, bySeed);
    const second = seedAt(ordered, slot * 2 + 1, bySeed);
    slots.push({
      podNumber: slot + 1,
      seeds: [first.seed, second.seed],
      playerIds: [first.playerId, second.playerId],
    });
  }
  return slots;
}

export function nextCutRoundPairs(
  previous: readonly { podNumber: number; winnerId: string }[],
  seedByPlayer: ReadonlyMap<string, number>,
): BracketSlot[] {
  if (previous.length < 2 || previous.length % 2 !== 0) {
    throw new Error(
      `nextCutRoundPairs: expected an even pod count of at least 2, got ${previous.length}`,
    );
  }
  const ordered = previous.toSorted((a, b) => a.podNumber - b.podNumber);
  const slots: BracketSlot[] = [];
  for (let slot = 0; slot * 2 < ordered.length; slot++) {
    const first = ordered[slot * 2];
    const second = ordered[slot * 2 + 1];
    if (first === undefined || second === undefined) {
      throw new Error(`nextCutRoundPairs: no pods feeding pod ${slot + 1}`);
    }
    const firstSeed = seedByPlayer.get(first.winnerId);
    const secondSeed = seedByPlayer.get(second.winnerId);
    if (firstSeed === undefined || secondSeed === undefined) {
      throw new Error(
        `nextCutRoundPairs: no seed for ${firstSeed === undefined ? first.winnerId : second.winnerId}`,
      );
    }
    const [high, low] =
      firstSeed <= secondSeed
        ? [
            { id: first.winnerId, seed: firstSeed },
            { id: second.winnerId, seed: secondSeed },
          ]
        : [
            { id: second.winnerId, seed: secondSeed },
            { id: first.winnerId, seed: firstSeed },
          ];
    slots.push({
      podNumber: slot + 1,
      seeds: [high.seed, low.seed],
      playerIds: [high.id, low.id],
    });
  }
  return slots;
}
