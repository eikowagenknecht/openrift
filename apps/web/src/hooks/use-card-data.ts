import type { CardFilters, Printing, SortOption } from "@openrift/shared";
import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";

interface UseCardDataParams {
  allCards: Printing[];
  setInfoList: SetInfo[];
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  ownedCountByPrinting: Record<string, number> | undefined;
}

// In "cards" mode, deduplicate by cardId — keep the printing with the lowest shortCode.
function deduplicateByCard(filteredCards: Printing[]): Printing[] {
  const seen = new Map<string, Printing>();
  for (const printing of filteredCards) {
    const existing = seen.get(printing.card.id);
    if (!existing || printing.shortCode.localeCompare(existing.shortCode) < 0) {
      seen.set(printing.card.id, printing);
    }
  }
  return [...seen.values()];
}

// Group all printings by cardId and sort each group by shortCode.
function groupPrintingsByCardId(allCards: Printing[]): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const p of allCards) {
    let group = map.get(p.card.id);
    if (!group) {
      group = [];
      map.set(p.card.id, group);
    }
    group.push(p);
  }
  for (const group of map.values()) {
    group.sort((a, b) => a.shortCode.localeCompare(b.shortCode));
  }
  return map;
}

// Compute min/max market price per cardId from grouped printings.
function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of printings) {
      const price = p.marketPrice;
      if (price !== null && price !== undefined) {
        min = Math.min(min, price);
        max = Math.max(max, price);
      }
    }
    if (min !== Infinity) {
      map.set(cardId, { min, max });
    }
  }
  return map;
}

// Build owned-count map keyed by printing ID. In "cards" view, the representative gets the sum.
function buildOwnedCounts(
  allCards: Printing[],
  displayCards: Printing[],
  ownedCountByPrinting: Record<string, number>,
  view: "cards" | "printings",
): Map<string, number> {
  const map = new Map<string, number>();
  if (view === "cards") {
    const countByCard = new Map<string, number>();
    for (const p of allCards) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      countByCard.set(p.card.id, (countByCard.get(p.card.id) ?? 0) + count);
    }
    for (const p of displayCards) {
      const count = countByCard.get(p.card.id) ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  } else {
    for (const p of allCards) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  }
  return map;
}

export function useCardData({
  allCards,
  setInfoList,
  filters,
  sortBy,
  sortDir,
  view,
  ownedCountByPrinting,
}: UseCardDataParams) {
  const setSlugToName = new Map(setInfoList.map((s) => [s.slug, s.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const availableFilters = getAvailableFilters(allCards);
  const filteredCards = filterCards(allCards, filters);

  const displayCards = view === "cards" ? deduplicateByCard(filteredCards) : filteredCards;

  const sorted = sortCards(displayCards, sortBy);
  const sortedCards = sortDir === "desc" ? sorted.toReversed() : sorted;

  const printingsByCardId = groupPrintingsByCardId(allCards);

  const priceRangeByCardId = view === "cards" ? computePriceRanges(printingsByCardId) : null;

  const ownedCounts = ownedCountByPrinting
    ? buildOwnedCounts(allCards, displayCards, ownedCountByPrinting, view)
    : undefined;

  const totalUniqueCards =
    view === "cards" ? new Set(allCards.map((c) => c.card.id)).size : allCards.length;

  return {
    availableFilters,
    displayCards,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  };
}
