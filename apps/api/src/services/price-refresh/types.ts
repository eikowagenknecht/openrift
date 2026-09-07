import type { PriceRefreshUpsertCounts } from "@openrift/shared/types/api/admin";
import type { Marketplace } from "@openrift/shared/types/pricing";

export interface UpsertCounts {
  prices: PriceRefreshUpsertCounts;
}

export interface PriceUpsertConfig {
  marketplace: Marketplace;
}

export interface GroupRow {
  groupId: number;
  name?: string;
  abbreviation?: string;
}

export interface PriceColumns {
  marketCents: number | null;
  lowCents: number | null;
  zeroLowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
}

/**
 * A fetched-price row for a marketplace SKU; `upsertPriceData` collapses one
 * row per (externalId, finish, language, recorded_at) into per-product rows.
 */
export interface StagingRow extends PriceColumns {
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  language: string | null;
  recordedAt: Date;
}
