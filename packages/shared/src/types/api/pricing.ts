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
 * CardTrader has no "market" price like TCG/CM, but since migration 099 each
 * snapshot carries two asking-price figures:
 *  - `zeroLow`: cheapest among CardTrader Zero (hub-eligible) sellers — the
 *    headline price shown in the UI.
 *  - `low`: cheapest across all sellers (including non-Zero) — a secondary
 *    figure plotted alongside `zeroLow` on the history chart.
 * Either field may be null (older snapshots predate the Zero column, or no
 * Zero sellers exist for the variant). The API only emits a snapshot when at
 * least one is non-null.
 */
export interface CardtraderSnapshot {
  date: string;
  zeroLow: number | null;
  low: number | null;
}

/**
 * Metadata describing how a marketplace maps to a printing: whether a mapping
 * exists, its external product ID (for deep-link URLs), and whether the
 * marketplace exposes only a cross-language aggregate price (Cardmarket).
 */
export interface MarketplaceInfo {
  available: boolean;
  productId: number | null;
  languageAggregate: boolean;
}

/**
 * Per-marketplace slice of the price history response — {@link MarketplaceInfo}
 * plus the snapshot series.
 */
interface PriceHistorySlice<TSnapshot> extends MarketplaceInfo {
  snapshots: TSnapshot[];
}

export interface PriceHistoryResponse {
  tcgplayer: PriceHistorySlice<TcgplayerSnapshot>;
  cardmarket: PriceHistorySlice<CardmarketSnapshot>;
  cardtrader: PriceHistorySlice<CardtraderSnapshot>;
}

export interface MarketplaceInfoResponse {
  infos: Record<
    string,
    {
      tcgplayer: MarketplaceInfo;
      cardmarket: MarketplaceInfo;
      cardtrader: MarketplaceInfo;
    }
  >;
}

export type AnySnapshot = TcgplayerSnapshot | CardmarketSnapshot | CardtraderSnapshot;

/**
 * Headline price for a snapshot — `market` for TCGplayer/Cardmarket, or the
 * Zero-eligible low (falling back to the overall low) for CardTrader. The API
 * guarantees that at least one of `zeroLow`/`low` is non-null on every CT
 * snapshot, so the combined value is always a number.
 * @returns The number that should be plotted as the main price line/area.
 */
export function snapshotHeadline(snap: AnySnapshot): number {
  if ("market" in snap) {
    return snap.market;
  }
  return (snap.zeroLow ?? snap.low) as number;
}
