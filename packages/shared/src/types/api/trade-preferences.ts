import type { effectiveTradePreferenceSchema } from "@openrift/shared/contracts/friend-groups";
import type { tradePreferenceSchema } from "@openrift/shared/response-schemas";
import type { z } from "zod";

/** Price reference the user states. NULL means "no preference, hash out personally". */
export type TradePricePref = "cm_lowest" | "tcg_lowest" | "ct_zero" | "absolute";

/** What the user wants in return / will pay with. NULL means "no preference". */
export type TradeType = "cards" | "money" | "both";

export type Currency = "EUR" | "USD";

export const TRADE_PRICE_PREFS: readonly TradePricePref[] = [
  "cm_lowest",
  "tcg_lowest",
  "ct_zero",
  "absolute",
] as const;

export const TRADE_TYPES: readonly TradeType[] = ["cards", "money", "both"] as const;

export const CURRENCIES: readonly Currency[] = ["EUR", "USD"] as const;

/** The triple as stored on either a list (as default_*) or an entry (as override). */
export type TradePreference = z.infer<typeof tradePreferenceSchema>;

/** Effective preference at one side of a match. Includes the list's currency. */
export type EffectiveTradePreference = z.infer<typeof effectiveTradePreferenceSchema>;

/**
 * Resolves an entry's effective preference: entry override beats list default,
 * coalesced field-by-field.
 * @returns The effective preference, with `currency` always taken from the list.
 */
export function resolveEffectiveTradePreference(
  entry: TradePreference,
  listDefault: TradePreference,
  currency: Currency | null,
): EffectiveTradePreference {
  const pricePref = entry.pricePref ?? listDefault.pricePref;
  const priceAbsoluteCents =
    pricePref === "absolute" ? (entry.priceAbsoluteCents ?? listDefault.priceAbsoluteCents) : null;
  const tradeType = entry.tradeType ?? listDefault.tradeType;
  return { pricePref, priceAbsoluteCents, tradeType, currency };
}

/**
 * Returns true when the preference carries no signal at all.
 * @returns Whether the preference is empty.
 */
export function isEmptyTradePreference(pref: TradePreference): boolean {
  return pref.pricePref === null && pref.tradeType === null;
}
