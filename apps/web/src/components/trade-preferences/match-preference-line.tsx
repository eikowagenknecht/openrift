import type {
  EffectiveTradePreference,
  Marketplace,
  MarketplaceInfo,
  TradePricePref,
} from "@openrift/shared";

import { MARKETPLACE_META } from "@/lib/marketplace-meta";

import {
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_SHORT_LABEL,
  formatAbsolutePrice,
} from "./trade-preference-labels";

const PREF_TO_MARKETPLACE: Record<TradePricePref, Marketplace | null> = {
  cm_lowest: "cardmarket",
  tcg_lowest: "tcgplayer",
  ct_zero: "cardtrader",
  absolute: null,
};

interface MatchPreferenceLineProps {
  prefix: string;
  pref: EffectiveTradePreference;
  /**
   * Marketplace product IDs for the printing this side references. When
   * present, marketplace-preset labels render as anchor tags to the product
   * page. When `null`, the side falls back to a search URL keyed off
   * `searchQuery`.
   */
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
  /** Card name used for the search-URL fallback (card-kind wishes). */
  searchQuery: string;
}

/**
 * Renders one side's resolved preference next to a match row. Marketplace
 * presets become external links (product page when we know the marketplace
 * product ID, search page otherwise). Absolute prices and "no preference"
 * render as plain text. Renders nothing when both fields are NULL.
 * @returns The line node, or `null` when there is nothing to display.
 */
export function MatchPreferenceLine({
  prefix,
  pref,
  marketplaceInfos,
  searchQuery,
}: MatchPreferenceLineProps) {
  const priceNode = renderPrice(pref, marketplaceInfos, searchQuery);
  const typeNode = pref.tradeType ? TRADE_TYPE_SHORT_LABEL[pref.tradeType] : null;
  if (priceNode === null && typeNode === null) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs">
      <span className="font-medium">{prefix}</span> {priceNode}
      {priceNode && typeNode ? <span className="mx-1 opacity-50">·</span> : null}
      {typeNode}
    </span>
  );
}

function renderPrice(
  pref: EffectiveTradePreference,
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null,
  searchQuery: string,
) {
  if (pref.pricePref === null) {
    return null;
  }
  if (pref.pricePref === "absolute") {
    return formatAbsolutePrice(pref.priceAbsoluteCents, pref.currency);
  }
  const marketplace = PREF_TO_MARKETPLACE[pref.pricePref];
  if (marketplace === null) {
    return PRICE_PREF_SHORT_LABEL[pref.pricePref];
  }
  const meta = MARKETPLACE_META[marketplace];
  const productId = marketplaceInfos?.[marketplace]?.productId ?? null;
  const href = productId === null ? meta.searchUrl(searchQuery) : meta.productUrl(productId);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="hover:text-foreground relative underline-offset-2 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {PRICE_PREF_SHORT_LABEL[pref.pricePref]}
    </a>
  );
}
