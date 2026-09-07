import type {
  cardmarketSnapshotSchema,
  cardtraderSnapshotSchema,
  marketplaceInfoResponseSchema,
  marketplaceInfoSchema,
  priceHistoryResponseSchema,
  pricesResponseSchema,
  tcgplayerSnapshotSchema,
} from "@openrift/shared/contracts/prices";
import type { z } from "zod";

import type { Marketplace } from "../pricing.js";

/** Integer cents. The currency of each marketplace is in the `currencies` map on {@link PricesResponse}. */
export type PriceMap = Record<string, Partial<Record<Marketplace, number>>>;

export type PricesResponse = z.infer<typeof pricesResponseSchema>;

/**
 * Backed by either a {@link PriceMap} (e.g. SSR detail responses) or a
 * react-query store (the client-side `usePrices()` hook).
 */
export interface PriceLookup {
  get: (printingId: string, marketplace: Marketplace) => number | undefined;
  has: (printingId: string) => boolean;
}

export type TcgplayerSnapshot = z.infer<typeof tcgplayerSnapshotSchema>;

export type CardmarketSnapshot = z.infer<typeof cardmarketSnapshotSchema>;

/**
 * `zeroLow` (cheapest CardTrader Zero seller, the headline price) and `low`
 * (cheapest across all sellers) may each be null, but never both.
 */
export type CardtraderSnapshot = z.infer<typeof cardtraderSnapshotSchema>;

export type MarketplaceInfo = z.infer<typeof marketplaceInfoSchema>;

export type PriceHistoryResponse = z.infer<typeof priceHistoryResponseSchema>;

export type MarketplaceInfoResponse = z.infer<typeof marketplaceInfoResponseSchema>;

export type AnySnapshot = TcgplayerSnapshot | CardmarketSnapshot | CardtraderSnapshot;

export function snapshotHeadline(snap: AnySnapshot): number {
  if ("market" in snap) {
    return snap.market;
  }
  return (snap.zeroLow ?? snap.low) as number;
}
