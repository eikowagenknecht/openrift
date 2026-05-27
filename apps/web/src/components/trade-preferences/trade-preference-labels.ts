import type { Currency, TradePricePref, TradeType } from "@openrift/shared";

export const PRICE_PREF_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "Cardmarket lowest",
  tcg_lowest: "TCGplayer lowest",
  ct_zero: "Cardtrader Zero",
  absolute: "Fixed price",
};

/** Compact label for the inline pill. Falls back to the long label for unknown values. */
export const PRICE_PREF_SHORT_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "CM lowest",
  tcg_lowest: "TCG lowest",
  ct_zero: "CT Zero",
  absolute: "fixed",
};

export const TRADE_TYPE_LABEL: Record<TradeType, string> = {
  cards: "Cards",
  money: "Money",
  both: "Cards or money",
};

export const TRADE_TYPE_SHORT_LABEL: Record<TradeType, string> = {
  cards: "cards",
  money: "money",
  both: "both",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
};

/**
 * Formats a cents amount + currency as a human-readable string.
 * Drops the decimals when whole-euro.
 * @returns "4 EUR", "4.50 EUR", or `null` when the currency or amount is missing.
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
  const formatted = remainder === 0 ? `${whole}` : `${whole}.${String(remainder).padStart(2, "0")}`;
  return `${formatted} ${currency}`;
}
