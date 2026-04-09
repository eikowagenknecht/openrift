import type { Marketplace } from "@openrift/shared";

import { affiliateUrl, cardtraderAffiliateUrl } from "@/lib/affiliate";

interface MarketplaceMeta {
  label: string;
  icon: string;
  searchUrl: (query: string) => string;
}

export const MARKETPLACE_META: Record<Marketplace, MarketplaceMeta> = {
  tcgplayer: {
    label: "TCGplayer",
    icon: "/images/external/tcgplayer-38x28.webp",
    searchUrl: (query) =>
      affiliateUrl(
        `https://www.tcgplayer.com/search/riftbound/product?q=${encodeURIComponent(query)}`,
      ),
  },
  cardmarket: {
    label: "Cardmarket",
    icon: "/images/external/cardmarket-20x28.webp",
    searchUrl: (query) =>
      `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(query)}`,
  },
  cardtrader: {
    label: "CardTrader",
    icon: "/images/external/cardtrader-20x28.webp",
    searchUrl: (query) =>
      cardtraderAffiliateUrl(`https://www.cardtrader.com/en/search?q=${encodeURIComponent(query)}`),
  },
};
