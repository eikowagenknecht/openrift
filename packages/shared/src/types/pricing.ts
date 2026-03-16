export interface PricesData {
  prices: Record<string, number>;
}

export type Marketplace = "tcgplayer" | "cardmarket";

/** Maps each time range to its lookback window in days (`null` = no limit). */
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;

export interface TcgplayerSnapshot {
  date: string;
  market: number;
  low: number | null;
  mid: number | null;
  high: number | null;
}

export interface CardmarketSnapshot {
  date: string;
  market: number;
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
}

export interface PriceHistoryResponse {
  printingId: string;
  tcgplayer: {
    available: boolean;
    currency: "USD";
    productId: number | null;
    snapshots: TcgplayerSnapshot[];
  };
  cardmarket: {
    available: boolean;
    currency: "EUR";
    productId: number | null;
    snapshots: CardmarketSnapshot[];
  };
}
