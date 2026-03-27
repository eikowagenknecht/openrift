export type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

export const ALL_MARKETPLACES: readonly Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];

export const EUR_MARKETPLACES: ReadonlySet<Marketplace> = new Set(["cardmarket", "cardtrader"]);

/** Maps each time range to its lookback window in days (`null` = no limit). */
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;
