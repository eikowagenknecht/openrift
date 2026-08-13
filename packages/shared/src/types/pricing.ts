import { z } from "zod";

import { WellKnown } from "../well-known.js";
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

/**
 * Printing languages a marketplace's SKUs may be bound to, or `null` for no
 * restriction.
 *
 * TCGplayer is a US storefront carrying English stock only, so one of its SKUs
 * must never end up on a Simplified Chinese printing — the SC printing would
 * inherit an English card's price. Its price guide is language-aggregate
 * (`marketplace_products.language` is NULL), which is exactly why the mapping
 * suggester used to fan a single SKU out across every sibling printing,
 * English and Chinese alike.
 *
 * Cardmarket is also language-aggregate but genuinely does list non-English
 * stock, so it stays unrestricted. CardTrader carries the language on the SKU
 * itself and the suggester already matches it exactly, so a list would be
 * redundant there.
 */
export const MARKETPLACE_PRINTING_LANGUAGES: Record<Marketplace, ReadonlySet<string> | null> = {
  tcgplayer: new Set([WellKnown.language.EN]),
  cardmarket: null,
  cardtrader: null,
};

/**
 * Whether a marketplace's SKUs may be bound to a printing in `language`.
 *
 * @returns True when the marketplace carries that language (or is unrestricted).
 */
export function marketplaceCarriesLanguage(marketplace: Marketplace, language: string): boolean {
  const carried = MARKETPLACE_PRINTING_LANGUAGES[marketplace];
  return carried === null || carried.has(language);
}

/**
 * Days a headline price may go unobserved before it is reported as stale.
 *
 * The price pipeline writes a snapshot only when a marketplace returns data,
 * so a card whose last listing sold keeps its final price forever. A week is
 * wide enough to ride out a missed cron run and narrow enough to catch a real
 * delisting: marketplace products cluster hard into "seen yesterday" and "not
 * seen in a month", with very little in between.
 */
export const PRICE_STALE_AFTER_DAYS = 7;

/** Maps each time range to its lookback window in days (`null` = no limit). */
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type TimeRange = keyof typeof TIME_RANGE_DAYS;
