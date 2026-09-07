import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import { useCards } from "@/features/cards/hooks/use-cards";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import { useDeckTokens } from "@/features/decks/hooks/use-deck-tokens";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { sortOverviewCards } from "@/features/decks/lib/deck-card-sort";
import type { CardViewerItem } from "@/lib/card-viewer-types";

/** Mirrors the visual stacking in `DeckOverview` so prev/next in the detail pane matches it. */
const ZONE_ORDER: DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
];

interface UseDeckItemsResult {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
}

/**
 * Each zone appearance gets its own item, keyed `${zone}:${printingId}`, so a
 * card in both main and sideboard anchors nav at the instance clicked; tokens carry no zone.
 */
export function useDeckItems(cards: DeckBuilderCard[]): UseDeckItemsResult {
  "use memo";
  const { printingsByCardId } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const tokens = useDeckTokens(cards);

  const items: CardViewerItem[] = [];
  for (const zone of ZONE_ORDER) {
    const inZone = cards.filter((card) => card.zone === zone);
    const sorted = sortOverviewCards(inZone, zone);
    for (const card of sorted) {
      const printing = getPreferredPrinting(card.cardId, card.preferredPrintingId);
      if (!printing) {
        continue;
      }
      items.push({ id: `${zone}:${printing.id}`, printing, zone });
    }
  }

  for (const token of tokens) {
    items.push({ id: `token:${token.printing.id}`, printing: token.printing });
  }

  return { items, printingsByCardId };
}
