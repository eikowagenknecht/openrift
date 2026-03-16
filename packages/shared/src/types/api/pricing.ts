export interface PricesResponse {
  prices: Record<string, number>;
}

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
