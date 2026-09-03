import type { MetaEventPlayer } from "@openrift/shared";

import type { MetaDeckCost } from "@/lib/meta-deck-collection";

/** The cost axes of one event's standings, the same two the deck browser carries. */
export interface StandingsCostBounds {
  maxCost: number | null;
  valueRange: { min: number | null; max: number | null };
}

export function isCostFilterActive(bounds: StandingsCostBounds): boolean {
  return (
    bounds.maxCost !== null || bounds.valueRange.min !== null || bounds.valueRange.max !== null
  );
}

/** Kept in step with `passesAxis` in `meta-deck-filters.ts`. */
export function costMatchesBounds(
  cost: MetaDeckCost | undefined,
  bounds: StandingsCostBounds,
): boolean {
  if (!isCostFilterActive(bounds)) {
    return true;
  }
  if (cost === undefined) {
    return false;
  }
  if (
    bounds.maxCost !== null &&
    (cost.toComplete === undefined || cost.toComplete > bounds.maxCost)
  ) {
    return false;
  }
  const { min, max } = bounds.valueRange;
  if (min === null && max === null) {
    return true;
  }
  if (cost.value === undefined) {
    return false;
  }
  return (min === null || cost.value >= min) && (max === null || cost.value <= max);
}

function costFor(
  player: MetaEventPlayer,
  costs: ReadonlyMap<string, MetaDeckCost> | undefined,
): MetaDeckCost | undefined {
  return player.deckId === null ? undefined : costs?.get(player.deckId);
}

/** How much of the field a cost bound would leave, with the value range still applied. */
export function countStandingsUnderCost(
  players: readonly MetaEventPlayer[],
  costs: ReadonlyMap<string, MetaDeckCost> | undefined,
  bounds: StandingsCostBounds,
  maxCost: number | null,
): number {
  const swapped = { ...bounds, maxCost };
  return players.filter(
    (player) => player.deckId !== null && costMatchesBounds(costFor(player, costs), swapped),
  ).length;
}

/**
 * The largest priced figure among this event's own lists. The costs map is
 * archive-wide, so the whole archive's ceiling would scale a slider nobody at
 * this event can reach.
 */
export function highestStandingsCost(
  players: readonly MetaEventPlayer[],
  costs: ReadonlyMap<string, MetaDeckCost> | undefined,
  pick: (cost: MetaDeckCost) => number | undefined,
): number | undefined {
  let highest: number | undefined;
  for (const player of players) {
    const cost = costFor(player, costs);
    const picked = cost === undefined ? undefined : pick(cost);
    if (picked !== undefined && (highest === undefined || picked > highest)) {
      highest = picked;
    }
  }
  return highest;
}
