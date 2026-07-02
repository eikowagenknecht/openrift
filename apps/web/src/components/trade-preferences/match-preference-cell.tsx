import type {
  EffectiveTradePreference,
  Marketplace,
  MarketplaceInfo,
  TradePricePref,
} from "@openrift/shared";

import { MARKETPLACE_META } from "@/lib/marketplace-meta";

import {
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_LABEL,
  formatAbsolutePrice,
} from "./trade-preference-labels";

const PREF_TO_MARKETPLACE: Record<TradePricePref, Marketplace | null> = {
  cm_lowest: "cardmarket",
  tcg_lowest: "tcgplayer",
  ct_zero: "cardtrader",
  absolute: null,
};

interface MatchPreferenceCellProps {
  label: string;
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
 * One side of the matches-tile preference panel ("They want" / "You'd pay").
 * Always renders, even when the side has no resolved preference — null prefs
 * fall back to "Not set" so both panels stay visually balanced. Marketplace
 * presets render as external links (product page when the marketplace product
 * ID is known, search page otherwise).
 * @returns The panel cell.
 */
export function MatchPreferenceCell({
  label,
  pref,
  marketplaceInfos,
  searchQuery,
}: MatchPreferenceCellProps) {
  const priceNode = renderPrice(pref, marketplaceInfos, searchQuery);
  const typeNode = pref.tradeType ? TRADE_TYPE_LABEL[pref.tradeType] : null;
  return (
    // Two-line cell (label, then price · accepts on one line) so the row height
    // stays compact. Short marketplace labels ("Cardmarket") keep the price line
    // from wrapping in the narrow column.
    <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1">
      <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="text-xs whitespace-nowrap">
        {priceNode ?? "Not set"}
        {typeNode ? <span className="text-muted-foreground"> · {typeNode}</span> : null}
      </span>
    </div>
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
