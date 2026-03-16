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
}

// ── Generic row types ───────────────────────────────────────────────────

export interface GroupRow {
  group_id: number;
  name?: string;
  abbreviation?: string;
}

/** All 8 price columns shared by marketplace_snapshots and marketplace_staging. */
export interface PriceColumns {
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

/** A staging row with all 8 price columns (unused ones are null). */
export interface StagingRow extends PriceColumns {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
}

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
