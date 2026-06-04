import type { PriceLookup, PriceMap } from "./types/api/pricing.js";

/**
 * Build a {@link PriceLookup} backed by a {@link PriceMap}.
 *
 * The wire {@link PriceMap} holds integer **cents**. This lookup is the
 * single boundary where prices cross into the web's display/arithmetic layer,
 * so it returns major-currency-unit floats (cents / 100) — every `get()`
 * consumer (collection stats, price ranges, list value, etc.) keeps working in
 * the same unit as before the cents migration.
 * @returns A lookup that converts the map's cents to major-unit floats.
 */
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

/**
 * Empty lookup — has nothing for any printing. Useful as a fallback while
 * prices are loading or in tests that don't care about prices.
 */
export const EMPTY_PRICE_LOOKUP: PriceLookup = {
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the PriceLookup contract
  get: () => undefined,
  has: () => false,
};
