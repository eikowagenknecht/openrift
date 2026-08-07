import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { PlanSwapDraft } from "@/lib/deck-plan";

/**
 * Whether the experiment changes anything, so callers can skip the projection
 * and keep the untouched deck array.
 * @returns true when at least one swap moves a copy.
 */
export function hasActiveSwaps(swaps: readonly PlanSwapDraft[]): boolean {
  return swaps.some((swap) => swap.quantity > 0);
}

/**
 * Finds the first entry of a card in one zone, skipping entries already
 * dropped by an earlier swap.
 * @returns The entry's index, or -1 when the card isn't in that zone.
 */
function findZoneIndex(
  entries: readonly (DeckBuilderCard | null)[],
  cardId: string,
  zone: string,
): number {
  return entries.findIndex(
    (entry) => entry !== null && entry.cardId === cardId && entry.zone === zone,
  );
}

/**
 * Takes up to `requested` copies of a card out of one zone, spreading the cut
 * over every entry there. A card can hold several entries per zone when copies
 * pin different printings, so a swap counted per card id has to drain them in
 * order rather than stopping at the first.
 *
 * @returns How many copies were actually removed, and the first entry they
 * came from (the template for a new entry in the destination zone).
 */
function takeFromZone(
  entries: (DeckBuilderCard | null)[],
  cardId: string,
  zone: string,
  requested: number,
): { taken: number; source?: DeckBuilderCard } {
  let remaining = requested;
  let source: DeckBuilderCard | undefined;
  for (const [index, entry] of entries.entries()) {
    if (remaining <= 0) {
      break;
    }
    if (entry === null || entry.cardId !== cardId || entry.zone !== zone) {
      continue;
    }
    source ??= entry;
    const taken = Math.min(remaining, entry.quantity);
    const left = entry.quantity - taken;
    entries[index] = left === 0 ? null : { ...entry, quantity: left };
    remaining -= taken;
  }
  return { taken: requested - remaining, ...(source && { source }) };
}

/**
 * Projects a deck through a sideboard experiment: swapped-in copies move from
 * the sideboard into the main zone, swapped-out copies leave the main zone
 * entirely. Cut copies are deliberately not returned to the sideboard — the
 * question the Test tab answers is "what do my odds look like with this main
 * deck", so where a cut card ends up is irrelevant. Quantities are clamped to
 * the copies actually present (draining every entry of the zone, since pinned
 * printings split a card across several), and cards missing from the zone are
 * ignored; every other zone passes through untouched.
 *
 * Takes the deck plan's swap shape, so a matchup's swaps can be fed straight
 * in. Every "in" applies before any "out", which only matters for a card
 * swapped both ways.
 *
 * @returns A new card array. Neither the input array nor its card objects are
 * mutated.
 */
export function applySwaps(
  cards: readonly DeckBuilderCard[],
  swaps: readonly PlanSwapDraft[],
): DeckBuilderCard[] {
  // Nulls mark entries emptied out by a swap; they're filtered at the end so
  // indices stay stable while the swaps are applied.
  const entries: (DeckBuilderCard | null)[] = [...cards];

  for (const swap of swaps) {
    if (swap.direction !== "in" || swap.quantity <= 0) {
      continue;
    }
    const { taken, source } = takeFromZone(
      entries,
      swap.cardId,
      WellKnown.deckZone.SIDEBOARD,
      swap.quantity,
    );
    if (taken === 0 || !source) {
      continue;
    }
    const mainIndex = findZoneIndex(entries, swap.cardId, WellKnown.deckZone.MAIN);
    const main = mainIndex === -1 ? undefined : entries[mainIndex];
    if (main) {
      entries[mainIndex] = { ...main, quantity: main.quantity + taken };
    } else {
      entries.push({ ...source, zone: WellKnown.deckZone.MAIN, quantity: taken });
    }
  }

  for (const swap of swaps) {
    if (swap.direction === "out" && swap.quantity > 0) {
      takeFromZone(entries, swap.cardId, WellKnown.deckZone.MAIN, swap.quantity);
    }
  }

  return entries.filter((entry) => entry !== null);
}
