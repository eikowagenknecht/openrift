import type { SortCardsOptions } from "@openrift/shared/filters";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { SortOption } from "@openrift/shared/types/search";

/** In the marketplace's major units. */
export interface PriceRange {
  min: number;
  max: number;
}

/**
 * A card whose printings are all unpriced is absent from the result rather
 * than present with a sentinel, so callers can fall back per card.
 */
export function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
): Map<string, PriceRange> {
  const map = new Map<string, PriceRange>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const printing of printings) {
      const price = prices.get(printing.id, marketplace);
      if (price !== undefined) {
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

export interface PriceSortInput {
  sortBy: SortOption;
  sortDir: SortCardsOptions["sortDir"];
  /** Catalog sets in catalog order, for the cross-set card-ID tiebreaker. */
  sets: SortCardsOptions["sets"];
  getPrice: NonNullable<SortCardsOptions["getPrice"]>;
  rarityOrder: SortCardsOptions["rarityOrder"];
  /**
   * Present only in cards view, where one tile stands in for several
   * printings. Null in printings view, where each tile has its own price.
   */
  priceRangeByCardId: Map<string, PriceRange> | null;
}

/**
 * A cards-view tile sorts on the end of its range that matches the
 * direction: dearest first when descending, cheapest first when ascending.
 */
export function buildSortCardsOptions(input: PriceSortInput): SortCardsOptions {
  const { sortBy, sortDir, sets, getPrice, rarityOrder, priceRangeByCardId } = input;
  const sortOptions: SortCardsOptions = { sortDir, sets };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (printing) => {
      const range = priceRangeByCardId.get(printing.cardId);
      if (!range) {
        return getPrice(printing) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  } else if (sortBy === "price") {
    sortOptions.getPrice = getPrice;
  } else if (sortBy === "rarity") {
    sortOptions.rarityOrder = rarityOrder;
  }
  return sortOptions;
}
