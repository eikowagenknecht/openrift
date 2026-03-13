// ── Row-count types ─────────────────────────────────────────────────────

export interface UpsertRowCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
}

export interface UpsertCounts {
  sources: UpsertRowCounts;
  snapshots: UpsertRowCounts;
  staging: UpsertRowCounts;
}

export interface PriceRefreshResult {
  fetched: {
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

export interface SourceRow {
  printing_id: string;
  external_id: number;
  group_id: number;
  product_name: string;
}

export interface SnapshotData {
  printing_id: string;
  recorded_at: Date;
}

export interface StagingRow {
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
