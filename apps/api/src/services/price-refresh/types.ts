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
  groupId: number;
  name?: string;
  abbreviation?: string;
}

/** All 8 price columns shared by marketplace_snapshots and marketplace_staging. */
export interface PriceColumns {
  marketCents: number;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
}

/** A staging row with all 8 price columns (unused ones are null). */
export interface StagingRow extends PriceColumns {
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  recordedAt: Date;
}

// ── Reference data ──────────────────────────────────────────────────────

export interface ReferenceData {
  sets: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  printings: {
    id: string;
    cardId: string;
    setId: string;
    sourceId: string;
    publicCode: string;
    finish: string;
    artVariant: string;
    isSigned: boolean;
  }[];
  setNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  namesBySet: Map<string, Map<string, string>>;
  printingsByCardSetFinish: Map<string, string[]>;
  printingByFullKey: Map<string, string>;
}
