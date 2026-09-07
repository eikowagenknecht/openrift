import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { PlanSwapDraft } from "@/lib/deck-plan";

export function hasActiveSwaps(swaps: readonly PlanSwapDraft[]): boolean {
  return swaps.some((swap) => swap.quantity > 0);
}

function findZoneIndex(
  entries: readonly (DeckBuilderCard | null)[],
  cardId: string,
  zone: string,
): number {
  return entries.findIndex(
    (entry) => entry !== null && entry.cardId === cardId && entry.zone === zone,
  );
}

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

// Cut copies are deliberately not returned to the sideboard.
// All "in" swaps must apply before any "out" swap.
export function applySwaps(
  cards: readonly DeckBuilderCard[],
  swaps: readonly PlanSwapDraft[],
): DeckBuilderCard[] {
  // Entries are nulled, not removed, so indices stay stable during the loop below.
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
