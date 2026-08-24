import type {
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";

/** Cheapest and dearest printing of one card, in the marketplace's major units. */
export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Compute min/max market price per cardId from grouped printings, looking up
 * each printing's price on the user's favorite marketplace. A card whose
 * printings are all unpriced is absent from the result rather than present with
 * a sentinel, so callers can fall back per card.
 * @returns A map from cardId to price range.
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
  /** Resolves one printing's price on the favorite marketplace. */
  getPrice: NonNullable<SortCardsOptions["getPrice"]>;
  rarityOrder: SortCardsOptions["rarityOrder"];
  /**
   * Per-card price ranges, present only in cards view where one tile stands in
   * for several printings. Null in printings view, where each tile has its own
   * price and {@link PriceSortInput.getPrice} answers directly.
   */
  priceRangeByCardId: Map<string, PriceRange> | null;
}

/**
 * Assemble the sort options for a card-browser surface. A cards-view tile sorts
 * on the end of its range that matches the direction — dearest first when
 * descending, cheapest first when ascending — so a card never ranks behind one
 * whose printings it straddles.
 * @returns Options to hand to `sortCards`.
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
