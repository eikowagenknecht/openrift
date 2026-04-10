import type { Marketplace } from "../pricing.js";

export type PriceMap = Record<string, Partial<Record<Marketplace, number>>>;

export interface PricesResponse {
  prices: PriceMap;
}

/**
 * Lookup interface for resolving the latest price of a printing on a given marketplace.
 * Backed by either a {@link PriceMap} (e.g. SSR detail responses) or a react-query
 * store (the client-side `usePrices()` hook).
 */
export interface PriceLookup {
  get(printingId: string, marketplace: Marketplace): number | undefined;
  has(printingId: string): boolean;
}

export interface TcgplayerSnapshot {
  date: string;
  market: number;
  low: number | null;
}

export interface CardmarketSnapshot {
  date: string;
  market: number;
  low: number | null;
}

/**
 * CardTrader exposes only a "lowest available listing" price — there's no
 * separate market value, so snapshots carry just `low`.
 */
export interface CardtraderSnapshot {
  date: string;
  low: number;
}

export interface PriceHistoryResponse {
  tcgplayer: {
    available: boolean;
    productId: number | null;
    snapshots: TcgplayerSnapshot[];
  };
  cardmarket: {
    available: boolean;
    productId: number | null;
    snapshots: CardmarketSnapshot[];
  };
  cardtrader: {
    available: boolean;
    productId: number | null;
    snapshots: CardtraderSnapshot[];
  };
}

export type AnySnapshot = TcgplayerSnapshot | CardmarketSnapshot | CardtraderSnapshot;

/**
 * Headline price for a snapshot — `market` for TCGplayer/Cardmarket, `low` for
 * CardTrader (which has no separate market value).
 * @returns The number that should be plotted as the main price line/area.
 */
export function snapshotHeadline(snap: AnySnapshot): number {
  return "market" in snap ? snap.market : snap.low;
}
