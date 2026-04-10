import type { PriceLookup, PriceMap } from "./types/api/pricing.js";

/**
 * Build a {@link PriceLookup} backed by a {@link PriceMap}.
 * @returns A lookup that reads directly from the given map.
 */
export function priceLookupFromMap(map: PriceMap): PriceLookup {
  return {
    get(printingId, marketplace) {
      return map[printingId]?.[marketplace];
    },
    has(printingId) {
      return map[printingId] !== undefined;
    },
  };
}

/**
 * Empty lookup — has nothing for any printing. Useful as a fallback while
 * prices are loading or in tests that don't care about prices.
 */
export const EMPTY_PRICE_LOOKUP: PriceLookup = {
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the PriceLookup contract
  get: () => undefined,
  has: () => false,
};
