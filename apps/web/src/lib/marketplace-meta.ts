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
