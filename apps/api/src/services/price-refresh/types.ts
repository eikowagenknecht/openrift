import type { PriceRefreshUpsertCounts } from "@openrift/shared";

// ── Row-count types ─────────────────────────────────────────────────────

export interface UpsertCounts {
  prices: PriceRefreshUpsertCounts;
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

/** All 9 price columns on `marketplace_product_prices`. */
export interface PriceColumns {
  marketCents: number | null;
  lowCents: number | null;
  /** Lowest asking price among CardTrader Zero (hub-eligible) sellers. Null for other marketplaces. */
  zeroLowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
}

/**
 * A fetched-price row for a marketplace SKU. Used as the input row shape for
 * the price-refresh upsert pipeline — fetchers emit one row per
 * (externalId, finish, language, recorded_at), and `upsertPriceData` collapses
 * them into per-product price rows.
 */
export interface StagingRow extends PriceColumns {
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  /** NULL for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
  language: string | null;
  recordedAt: Date;
}
