import type { CardType, DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";

export const GROUPED_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

export const TYPE_GROUP_ORDER: CardType[] = [
  WellKnown.cardType.UNIT,
  "spell",
  WellKnown.cardType.GEAR,
];

/** Energy ascending → power ascending → card name alphabetical. */
export function compareDeckCardsByCurve(a: DeckBuilderCard, b: DeckBuilderCard): number {
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

/**
 * Non-grouped zones are returned as-is: the sidebar skips sorting them too,
 * so both surfaces keep the API-provided order (apps/api/src/repositories/decks.ts).
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
