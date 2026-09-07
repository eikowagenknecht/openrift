import { z } from "zod";

import { WellKnown } from "../well-known.js";
import type { Currency } from "./api/trade-preferences.js";

// Lives here, not in schemas.ts, because schemas.ts imports from types/ and a
// definition there would cycle.
export const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

export type Marketplace = z.infer<typeof marketplaceEnum>;

export const ALL_MARKETPLACES: readonly Marketplace[] = ["cardtrader", "tcgplayer", "cardmarket"];

export const EUR_MARKETPLACES: ReadonlySet<Marketplace> = new Set(["cardmarket", "cardtrader"]);

// Prices on the wire are integer cents with no currency of their own.
export const MARKETPLACE_CURRENCY: Record<Marketplace, Currency> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
  cardtrader: "EUR",
};

// TCGplayer is a US storefront carrying English stock only; its price guide is
// language-aggregate, so a SKU must never bind to a non-English printing.
export const MARKETPLACE_PRINTING_LANGUAGES: Record<Marketplace, ReadonlySet<string> | null> = {
  tcgplayer: new Set([WellKnown.language.EN]),
  cardmarket: null,
  cardtrader: null,
};

export function marketplaceCarriesLanguage(marketplace: Marketplace, language: string): boolean {
  const carried = MARKETPLACE_PRINTING_LANGUAGES[marketplace];
  return carried === null || carried.has(language);
}

export const PRICE_STALE_AFTER_DAYS = 7;

export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;
