import type { Random } from "../pack-opener/rng.js";
import type { GroupPlan, GroupPlanGroup } from "./group-cut-types.js";

const MIN_PLAYERS = 6;
const LETTERS = 26;

export class InvalidGroupCountError extends Error {
  readonly playerCount: number;

  constructor(playerCount: number) {
    super(
      playerCount < MIN_PLAYERS
        ? `A group stage needs at least ${MIN_PLAYERS} active players, not ${playerCount}.`
        : `Cannot fill groups of four with ${playerCount} active players. Add or drop one player to fill the groups.`,
    );
    this.name = "InvalidGroupCountError";
    this.playerCount = playerCount;
  }
}

/** Valid counts are 4n (n >= 2) and 4n + 2 (n >= 1): every even count from 6 up. */
export function validateGroupCount(count: number): void {
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count % 2 !== 0) {
    throw new InvalidGroupCountError(count);
  }
}

function shuffle<T>(items: readonly T[], rng: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const atI = result[i];
    const atJ = result[j];
    if (atI === undefined || atJ === undefined) {
      throw new Error(`shuffle: index out of range (${i}, ${j})`);
    }
    result[i] = atJ;
    result[j] = atI;
  }
  return result;
}

export function groupLabel(index: number): string {
  let label = "";
  let remaining = index;
  do {
    label = String.fromCodePoint(65 + (remaining % LETTERS)) + label;
    remaining = Math.floor(remaining / LETTERS) - 1;
  } while (remaining >= 0);
  return label;
}

export function planGroups(playerIds: readonly string[], rng: Random): GroupPlan {
  validateGroupCount(playerIds.length);
  const shuffled = shuffle(playerIds, rng);
  const fours =
    playerIds.length % 4 === 0 ? playerIds.length / 4 : (playerIds.length - MIN_PLAYERS) / 4;
  const groups: GroupPlanGroup[] = [];
  let taken = 0;
  for (let index = 0; index < fours; index++) {
    groups.push({
      label: groupLabel(groups.length),
      playerIds: shuffled.slice(taken, taken + 4),
      pairedWith: null,
    });
    taken += 4;
  }
  if (taken < shuffled.length) {
    const first = groupLabel(groups.length);
    const second = groupLabel(groups.length + 1);
    groups.push(
      { label: first, playerIds: shuffled.slice(taken, taken + 3), pairedWith: second },
      {
        label: second,
        playerIds: shuffled.slice(taken + 3, taken + 6),
        pairedWith: first,
      },
    );
  }
  return { groups };
}

export function groupUnits(plan: GroupPlan): GroupPlanGroup[][] {
  const byLabel = new Map(plan.groups.map((group) => [group.label, group]));
  const units: GroupPlanGroup[][] = [];
  const placed = new Set<string>();
  for (const group of plan.groups) {
    if (placed.has(group.label)) {
      continue;
    }
    placed.add(group.label);
    if (group.pairedWith === null) {
      units.push([group]);
      continue;
    }
    const partner = byLabel.get(group.pairedWith);
    if (partner === undefined) {
      throw new Error(
        `groupUnits: group ${group.label} is paired with unknown group ${group.pairedWith}`,
      );
    }
    placed.add(partner.label);
    units.push([group, partner]);
  }
  return units;
}

const FOUR_PLAYER_TABLES: Record<1 | 2 | 3, readonly (readonly [number, number])[]> = {
  1: [
    [0, 1],
    [2, 3],
  ],
  2: [
    [0, 2],
    [1, 3],
  ],
  3: [
    [0, 3],
    [1, 2],
  ],
};

function slotOf(group: GroupPlanGroup, slot: number): string {
  const playerId = group.playerIds[slot];
  if (playerId === undefined) {
    throw new Error(`unitRoundPairs: group ${group.label} has no player in slot ${slot}`);
  }
  return playerId;
}

export function unitRoundPairs(
  unit: readonly GroupPlanGroup[],
  round: 1 | 2 | 3,
): { pair: [string, string]; cross: boolean }[] {
  const [first, second] = unit;
  if (first === undefined) {
    throw new Error("unitRoundPairs: empty unit");
  }
  if (unit.length === 1) {
    if (first.playerIds.length !== 4) {
      throw new Error(`unitRoundPairs: group ${first.label} is not a 4-player group`);
    }
    return FOUR_PLAYER_TABLES[round].map(([a, b]) => ({
      pair: [slotOf(first, a), slotOf(first, b)] satisfies [string, string],
      cross: false,
    }));
  }
  if (unit.length !== 2 || second === undefined) {
    throw new Error(`unitRoundPairs: a unit holds one or two groups, got ${unit.length}`);
  }
  for (const group of [first, second]) {
    if (group.playerIds.length !== 3) {
      throw new Error(`unitRoundPairs: group ${group.label} is not a 3-player group`);
    }
  }
  const crossSlot = round - 1;
  const [restA, restB] = [0, 1, 2].filter((slot) => slot !== crossSlot);
  if (restA === undefined || restB === undefined) {
    throw new Error(`unitRoundPairs: round ${round} leaves no intra-group pair`);
  }
  return [
    { pair: [slotOf(first, crossSlot), slotOf(second, crossSlot)], cross: true },
    { pair: [slotOf(first, restA), slotOf(first, restB)], cross: false },
    { pair: [slotOf(second, restA), slotOf(second, restB)], cross: false },
  ];
}
