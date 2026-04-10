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

/**
 * Per-marketplace slice of the price history response. `languageAggregate`
 * is `true` when the marketplace only exposes a single cross-language price
 * (Cardmarket's price guide) — the UI should render an "any language" note
 * next to the price so users understand it doesn't break down per-language.
 */
interface PriceHistorySlice<TSnapshot> {
  available: boolean;
  productId: number | null;
  snapshots: TSnapshot[];
  languageAggregate: boolean;
}

export interface PriceHistoryResponse {
  tcgplayer: PriceHistorySlice<TcgplayerSnapshot>;
  cardmarket: PriceHistorySlice<CardmarketSnapshot>;
  cardtrader: PriceHistorySlice<CardtraderSnapshot>;
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
