import type { Currency } from "./api/trade-preferences.js";

export type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

export const ALL_MARKETPLACES: readonly Marketplace[] = ["cardtrader", "tcgplayer", "cardmarket"];

export const EUR_MARKETPLACES: ReadonlySet<Marketplace> = new Set(["cardmarket", "cardtrader"]);

/**
 * The currency each marketplace reports prices in. Prices on the wire are
 * integer cents and carry no currency of their own, so this is the
 * single source of truth for which currency a marketplace's cents are in.
 */
export const MARKETPLACE_CURRENCY: Record<Marketplace, Currency> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
  cardtrader: "EUR",
};

/** Maps each time range to its lookback window in days (`null` = no limit). */
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;
