import type { PriceLookup, PriceMap } from "./types/api/pricing.js";

/** The wire {@link PriceMap} holds integer cents; this lookup converts to major-unit floats. */
export function priceLookupFromMap(map: PriceMap): PriceLookup {
  return {
    get(printingId, marketplace) {
      const cents = map[printingId]?.[marketplace];
      return cents === undefined ? undefined : cents / 100;
    },
    has(printingId) {
      return map[printingId] !== undefined;
    },
  };
}

export const EMPTY_PRICE_LOOKUP: PriceLookup = {
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the PriceLookup contract
  get: () => undefined,
  has: () => false,
};
