import type { DeckZone, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useDeckTokens } from "@/hooks/use-deck-tokens";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { sortOverviewCards } from "@/lib/deck-card-sort";

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
