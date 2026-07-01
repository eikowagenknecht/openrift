import type { DeckZone, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useCards } from "@/hooks/use-cards";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { sortOverviewCards } from "@/lib/deck-card-sort";

/**
 * Display order of zones in the deck overview. Mirrors the visual stacking in
 * `DeckOverview` so prev/next in the detail pane walks the deck the way the
 * user sees it.
 */
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
 * Resolves a deck's cards into a `CardViewerItem` list (for the selection
 * store's prev/next navigation) plus a `printingsByCardId` map (for the detail
 * pane's variant picker). Items follow the visual order of the overview:
 * legend → champion → runes → battlefield → main → sideboard → overflow, with
 * grouped zones (main/sideboard/overflow) sorted by type then curve.
 *
 * Each zone appearance gets its own item: a card in both main and sideboard
 * produces two entries so highlight and arrow-nav anchor at the instance the
 * user clicked. Items carry a `zone` tag and use a composite `${zone}:${printingId}`
 * id so cells stay distinct within the list. Cards whose printing can't be
 * resolved (e.g. share-page during catalog hydration) are skipped.
 *
 * @returns The deck's printings as CardViewerItems plus the catalog map.
 */
export function useDeckItems(cards: DeckBuilderCard[]): UseDeckItemsResult {
  "use memo";
  const { printingsByCardId } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();

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

  return { items, printingsByCardId };
}
