import type { PriceRefreshUpsertCounts } from "@openrift/shared";

// ── Row-count types ─────────────────────────────────────────────────────

export interface UpsertCounts {
  snapshots: PriceRefreshUpsertCounts;
  staging: PriceRefreshUpsertCounts;
}

// ── Price upsert config ─────────────────────────────────────────────────

export interface PriceUpsertConfig {
  marketplace: string;
  /**
   * True when the marketplace's price data is cross-language aggregate
   * (Cardmarket). Staging rows carry a placeholder language ("EN") but the
   * matched variants have `language = NULL`, so the upsert key must ignore
   * the language dimension and match purely on (externalId, finish).
   */
  languageAggregate?: boolean;
}

// ── Generic row types ───────────────────────────────────────────────────

export interface GroupRow {
  groupId: number;
  name?: string;
  abbreviation?: string;
}

/** All 8 price columns shared by marketplace_snapshots and marketplace_staging. */
export interface PriceColumns {
  marketCents: number | null;
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
  language: string;
  recordedAt: Date;
}
