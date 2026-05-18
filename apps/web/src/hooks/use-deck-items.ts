import type { DeckZone, Printing } from "@openrift/shared";

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
  "legend",
  "champion",
  "runes",
  "battlefield",
  "main",
  "sideboard",
  "overflow",
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
 * Deduplicates by cardId: a card appearing in multiple zones occupies a single
 * entry, anchored at its first zone in the order above. Cards whose printing
 * can't be resolved (e.g. share-page during catalog hydration) are skipped, so
 * an empty deck or pre-hydration call returns an empty items list.
 *
 * @returns The deck's printings as CardViewerItems plus the catalog map.
 */
export function useDeckItems(cards: DeckBuilderCard[]): UseDeckItemsResult {
  "use memo";
  const { printingsByCardId } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();

  const items: CardViewerItem[] = [];
  const seen = new Set<string>();
  for (const zone of ZONE_ORDER) {
    const inZone = cards.filter((card) => card.zone === zone);
    const sorted = sortOverviewCards(inZone, zone);
    for (const card of sorted) {
      if (seen.has(card.cardId)) {
        continue;
      }
      const printing = getPreferredPrinting(card.cardId, card.preferredPrintingId);
      if (!printing) {
        continue;
      }
      seen.add(card.cardId);
      items.push({ id: printing.id, printing });
    }
  }

  return { items, printingsByCardId };
}
