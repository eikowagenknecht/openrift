import type { PrintingsTable } from "./catalog.js";

export interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
  /** A date, not a timestamp. */
  lastSeen: string;
}

/** `day` is a date, not a timestamp. */
export interface MvDailyPrintingPricesView {
  printingId: string;
  marketplace: string;
  day: string;
  headlineCents: number;
}

// Must stay exported — TypeScript names it in inferred Kysely query return
// types (e.g. selectCopyWithCard in repositories/query-helpers.ts).
// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface MvCardAggregatesView {
  cardId: string;
  domains: string[];
  superTypes: string[];
  types: string[];
  tokenCardIds: string[];
}

export type PrintingsOrderedView = PrintingsTable & { canonicalRank: number; hasFoilTwin: boolean };

// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface MvPrintingFoilTwinsView {
  printingId: string;
}
