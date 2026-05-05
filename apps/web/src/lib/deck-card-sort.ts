import type { CardType, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/** Zones where cards are grouped by type and sorted within each type. */
export const GROUPED_ZONES: ReadonlySet<DeckZone> = new Set(["main", "sideboard", "overflow"]);

/** Display order for type groups inside grouped zones. */
export const TYPE_GROUP_ORDER: CardType[] = [WellKnown.cardType.UNIT, "spell", "gear"];

/**
 * Stable comparator for deck cards inside a single type group:
 * energy ascending → power ascending → card name alphabetical.
 * @returns Negative if a should sort before b, positive after, 0 if equal.
 */
export function compareDeckCardsByCurve(a: DeckBuilderCard, b: DeckBuilderCard): number {
  const energyDiff = (a.energy ?? 0) - (b.energy ?? 0);
  if (energyDiff !== 0) {
    return energyDiff;
  }
  const powerDiff = (a.power ?? 0) - (b.power ?? 0);
  if (powerDiff !== 0) {
    return powerDiff;
  }
  return a.cardName.localeCompare(b.cardName);
}

/**
 * Flat sort for the deck overview that mirrors the sidebar's grouped display.
 * Orders grouped zones (main / sideboard / overflow) by type group
 * (Unit → Spell → Gear → other), then by curve within each group.
 * Non-grouped zones (legend / champion / runes / battlefield) are returned
 * as-is — the sidebar skips sorting them too, so both surfaces get the
 * API-provided order (zone then card name alphabetical, see
 * apps/api/src/repositories/decks.ts).
 * @returns A new array with the sorted cards, or the original reference if no sort applies.
 */
export function sortOverviewCards(cards: DeckBuilderCard[], zone: DeckZone): DeckBuilderCard[] {
  if (!GROUPED_ZONES.has(zone)) {
    return cards;
  }
  return cards.toSorted((a, b) => {
    const aRank = TYPE_GROUP_ORDER.indexOf(a.cardType as CardType);
    const bRank = TYPE_GROUP_ORDER.indexOf(b.cardType as CardType);
    const aIndex = aRank === -1 ? TYPE_GROUP_ORDER.length : aRank;
    const bIndex = bRank === -1 ? TYPE_GROUP_ORDER.length : bRank;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return compareDeckCardsByCurve(a, b);
  });
}
