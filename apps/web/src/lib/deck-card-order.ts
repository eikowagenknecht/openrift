import type { CardType, DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export const GROUPED_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

export const TYPE_GROUP_ORDER: CardType[] = [
  WellKnown.cardType.UNIT,
  "spell",
  WellKnown.cardType.GEAR,
];

function typeIndex(cardType: CardType): number {
  const idx = TYPE_GROUP_ORDER.indexOf(cardType);
  return idx === -1 ? TYPE_GROUP_ORDER.length : idx;
}

/** Type group, then energy asc, then power asc, then name. Matches the sidebar's within-zone ordering. */
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
  return legendDisplayName({ name: a.cardName, types: a.cardTypes, tags: a.tags }).localeCompare(
    legendDisplayName({ name: b.cardName, types: b.cardTypes, tags: b.tags }),
  );
}

/** Zones in `zoneOrder`; non-grouped zones keep their existing card order. */
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
