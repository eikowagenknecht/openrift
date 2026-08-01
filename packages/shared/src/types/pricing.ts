import { z } from "zod";

import type { Currency } from "./api/trade-preferences.js";

/**
 * The set of supported price marketplaces, as a Zod enum. Canonical home —
 * re-exported from `schemas.ts` for the write-side preference schema and the
 * admin price/operations contracts, and used directly by the dynamic list-rule
 * schema (`types/list-rule.ts`), so the enum is defined once. It lives here
 * (not in `schemas.ts`) because `schemas.ts` imports from `types/`, and a
 * definition there would cycle.
 */
export const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

export type Marketplace = z.infer<typeof marketplaceEnum>;

export const ALL_MARKETPLACES: readonly Marketplace[] = ["cardtrader", "tcgplayer", "cardmarket"];

export const EUR_MARKETPLACES: ReadonlySet<Marketplace> = new Set(["cardmarket", "cardtrader"]);

/**
 * The currency each marketplace reports prices in. Prices on the wire are
 * integer cents and carry no currency of their own, so this is the
 * single source of truth for which currency a marketplace's cents are in.
 */
export const MARKETPLACE_CURRENCY: Record<Marketplace, Currency> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
  cardtrader: "EUR",
};

/** Maps each time range to its lookback window in days (`null` = no limit). */
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;
