import type { Currency, TradePricePref, TradeType } from "@openrift/shared";

export const PRICE_PREF_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "Marketplace (Cardmarket)",
  tcg_lowest: "Marketplace (TCGplayer)",
  ct_zero: "Marketplace (CardTrader)",
  absolute: "Fixed",
};

export const PRICE_PREF_SHORT_LABEL: Record<TradePricePref, string> = {
  cm_lowest: "Cardmarket",
  tcg_lowest: "TCGplayer",
  ct_zero: "CardTrader",
  absolute: "Fixed",
};

// `absolute` is deliberately empty: that branch renders the formatted price instead.
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
