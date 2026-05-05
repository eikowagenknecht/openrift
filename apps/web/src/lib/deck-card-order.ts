import type { CardType, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/** Zones whose cards are grouped by type in the sidebar. */
export const GROUPED_ZONES = new Set<DeckZone>(["main", "sideboard", "overflow"]);

/** Display order for type groups inside grouped zones. */
export const TYPE_GROUP_ORDER: CardType[] = [WellKnown.cardType.UNIT, "spell", "gear"];

function typeIndex(cardType: CardType): number {
  const idx = TYPE_GROUP_ORDER.indexOf(cardType);
  return idx === -1 ? TYPE_GROUP_ORDER.length : idx;
}

/**
 * Comparator for cards inside a grouped zone: type group, then energy asc,
 * then power asc, then name. Matches the sidebar's within-zone ordering.
 * @returns Negative if `a` comes first, positive if `b` comes first.
 */
export function compareGroupedCards(a: DeckBuilderCard, b: DeckBuilderCard): number {
  const typeDiff = typeIndex(a.cardType) - typeIndex(b.cardType);
  if (typeDiff !== 0) {
    return typeDiff;
  }
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
 * Returns a flat list of deck cards ordered the same way the deck sidebar
 * displays them: zones in `zoneOrder`, and inside grouped zones the cards are
 * sorted by type group then energy/power/name. Non-grouped zones keep their
 * existing order.
 * @returns A new array; the input is not mutated.
 */
export function sortCardsLikeSidebar(
  cards: readonly DeckBuilderCard[],
  zoneOrder: readonly DeckZone[],
): DeckBuilderCard[] {
  const zoneIndex = new Map(zoneOrder.map((zone, idx) => [zone, idx]));
  const fallbackIdx = zoneOrder.length;
  const byZone = Map.groupBy(cards, (card) => card.zone);
  const orderedZones = [...byZone.keys()].toSorted(
    (a, b) => (zoneIndex.get(a) ?? fallbackIdx) - (zoneIndex.get(b) ?? fallbackIdx),
  );
  const result: DeckBuilderCard[] = [];
  for (const zone of orderedZones) {
    const zoneCards = byZone.get(zone) ?? [];
    if (GROUPED_ZONES.has(zone)) {
      result.push(...zoneCards.toSorted(compareGroupedCards));
    } else {
      result.push(...zoneCards);
    }
  }
  return result;
}
