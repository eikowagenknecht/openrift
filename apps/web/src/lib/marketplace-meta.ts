import type { Marketplace } from "@openrift/shared";

import { affiliateUrl, cardtraderAffiliateUrl } from "@/lib/affiliate";
import { cardmarketLangParam } from "@/lib/marketplace-language";

interface MarketplaceMeta {
  label: string;
  icon: string;
  searchUrl: (query: string) => string;
  productUrl: (productId: number, language?: string | null) => string;
}

export const MARKETPLACE_META: Record<Marketplace, MarketplaceMeta> = {
  tcgplayer: {
    label: "TCGplayer",
    icon: "/images/external/tcgplayer-38x28.webp",
    searchUrl: (query) =>
      affiliateUrl(
        `https://www.tcgplayer.com/search/riftbound/product?q=${encodeURIComponent(query)}`,
      ),
    productUrl: (id) => affiliateUrl(`https://www.tcgplayer.com/product/${id}`),
  },
  cardmarket: {
    label: "Cardmarket",
    icon: "/images/external/cardmarket-20x28.webp",
    searchUrl: (query) =>
      `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(query)}`,
    productUrl: (id, language) =>
      `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}${cardmarketLangParam(language)}`,
  },
  cardtrader: {
    label: "CardTrader",
    icon: "/images/external/cardtrader-20x28.webp",
    searchUrl: (query) =>
      cardtraderAffiliateUrl(`https://www.cardtrader.com/en/search?q=${encodeURIComponent(query)}`),
    productUrl: (id) => cardtraderAffiliateUrl(`https://www.cardtrader.com/en/cards/${id}`),
  },
};

/**
 * Display label for a marketplace, falling back to the raw value for unknown
 * marketplaces. Use when the marketplace is typed loosely as `string` (e.g.
 * admin rows) so call sites don't re-declare their own label map.
 * @returns The marketplace's display label.
 */
export function marketplaceLabel(name: string): string {
  return MARKETPLACE_META[name as Marketplace]?.label ?? name;
}

/**
 * Compact marketplace labels for tight UI like chart legends and price-source
 * toggles. The Record type keeps this exhaustive as marketplaces are added.
 */
export const MARKETPLACE_SHORT_LABELS: Record<Marketplace, string> = {
  tcgplayer: "TCG",
  cardmarket: "CM",
  cardtrader: "CT",
};
