// ── Row-count types ─────────────────────────────────────────────────────

export interface UpsertRowCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
}

export interface UpsertCounts {
  snapshots: UpsertRowCounts;
  staging: UpsertRowCounts;
}

export interface PriceRefreshResult {
  transformed: {
    groups: number;
    products: number;
    prices: number;
  };
  upserted: UpsertCounts;
}

// ── Price upsert config ─────────────────────────────────────────────────

export interface PriceUpsertConfig {
  marketplace: string;
  /** Price columns present in both snapshot and staging tables */
  priceColumns: string[];
}

// ── Generic row types ───────────────────────────────────────────────────

export interface GroupRow {
  group_id: number;
  name?: string;
  abbreviation?: string;
}

export interface StagingRow {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
}

// ── Marketplace-specific price columns ─────────────────────────────────

export interface CardmarketPrices {
  market_cents: number | null;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

export interface TcgplayerPrices {
  market_cents: number | null;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
}

export type CardmarketStagingRow = StagingRow & CardmarketPrices;
export type TcgplayerStagingRow = StagingRow & TcgplayerPrices;

// ── Reference data ──────────────────────────────────────────────────────

export interface ReferenceData {
  sets: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  printings: {
    id: string;
    card_id: string;
    set_id: string;
    source_id: string;
    public_code: string;
    finish: string;
    art_variant: string;
    is_signed: boolean;
  }[];
  setNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  namesBySet: Map<string, Map<string, string>>;
  printingsByCardSetFinish: Map<string, string[]>;
  printingByFullKey: Map<string, string>;
}
