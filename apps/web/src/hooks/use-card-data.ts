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

export function useCardData({
  allCards,
  setInfoList,
  filters,
  sortBy,
  sortDir,
  view,
  ownedCountByPrinting,
}: UseCardDataParams) {
  const setCodeToName = new Map(setInfoList.map((s) => [s.code, s.name]));
  const setDisplayLabel = (code: string) => setCodeToName.get(code) ?? code;

  const availableFilters = getAvailableFilters(allCards);
  const filteredCards = filterCards(allCards, filters);

  // In "cards" mode, deduplicate by cardId — keep the printing with the lowest sourceId.
  const displayCards =
    view === "cards"
      ? (() => {
          const seen = new Map<string, Printing>();
          for (const printing of filteredCards) {
            const existing = seen.get(printing.card.id);
            if (!existing || printing.sourceId.localeCompare(existing.sourceId) < 0) {
              seen.set(printing.card.id, printing);
            }
          }
          return [...seen.values()];
        })()
      : filteredCards;

  const sorted = sortCards(displayCards, sortBy);
  const sortedCards = sortDir === "desc" ? sorted.toReversed() : sorted;

  const printingsByCardId = (() => {
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
      group.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    }
    return map;
  })();

  const priceRangeByCardId =
    view === "cards"
      ? (() => {
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
        })()
      : null;

  // Build owned count map keyed by printing ID (card.id in frontend Card type).
  // In "cards" view, the representative printing gets the total across all printings.
  const ownedCounts = (() => {
    if (!ownedCountByPrinting) {
      return;
    }
    const map = new Map<string, number>();
    if (view === "cards") {
      // Sum counts by card.id, then assign to the representative printing shown in the grid
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
  })();

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
