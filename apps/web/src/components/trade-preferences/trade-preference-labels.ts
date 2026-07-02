import type { Currency, TradePricePref, TradeType } from "@openrift/shared";

export const PRICE_PREF_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "Marketplace (Cardmarket)",
  tcg_lowest: "Marketplace (TCGplayer)",
  ct_zero: "Marketplace (CardTrader)",
  absolute: "Fixed",
};

/** Compact label used in tight contexts (inline pill, inherit hints). Drops
 * the "Marketplace (...)" wrapping since the surrounding context already
 * makes it clear we're pointing at a marketplace.
 */
export const PRICE_PREF_SHORT_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "Cardmarket",
  tcg_lowest: "TCGplayer",
  ct_zero: "CardTrader",
  absolute: "Fixed",
};

/** Ultra-compact abbreviation used in the per-row pill, where the actions
 * column only has a couple of characters to spare. The `absolute` entry is
 * deliberately empty — that branch renders the formatted price instead.
 */
export const PRICE_PREF_ABBR: Record<TradePricePref, string> = {
  cm_lowest: "CM",
  tcg_lowest: "TCG",
  ct_zero: "CT",
  absolute: "",
};

export const TRADE_TYPE_LABEL: Record<TradeType, string> = {
  cards: "Cards",
  money: "Money",
  both: "Cards or money",
};

export const TRADE_TYPE_SHORT_LABEL: Record<TradeType, string> = {
  cards: "Cards",
  money: "Money",
  both: "Accepts cards or money",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
};

/**
 * Formats a cents amount + currency as a human-readable string. Always
 * renders two decimals so prices read consistently across the app.
 * @returns "4.00 EUR", "4.50 EUR", or `null` when the currency or amount is missing.
 */
export function formatAbsolutePrice(
  cents: number | null,
  currency: Currency | null,
): string | null {
  if (cents === null || currency === null) {
    return null;
  }
  const whole = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `${whole}.${String(remainder).padStart(2, "0")} ${currency}`;
}
