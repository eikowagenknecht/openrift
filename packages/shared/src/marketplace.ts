import type { Marketplace } from "./types/pricing.js";

const AFFILIATE_BASE = "https://partner.tcgplayer.com/openrift";

export function affiliateUrl(url: string): string {
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(url)}`;
}

const CT_SHARE_CODE = "openrift";

export function cardtraderAffiliateUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}share_code=${CT_SHARE_CODE}`;
}

// Numeric language ids from Cardmarket's own docs. ZH-TW is unused by the catalog but kept for fidelity to their list.
const CARDMARKET_LANGUAGE_CODES: Record<string, number> = {
  EN: 1,
  FR: 2,
  DE: 3,
  ES: 4,
  IT: 5,
  "ZH-CN": 6,
  SC: 6,
  ZH: 6,
  JA: 7,
  PT: 8,
  RU: 9,
  KO: 10,
  "ZH-TW": 11,
};

// Cardmarket is the only marketplace with a language query param: TCGplayer keys language into the productId, CardTrader into the listing.
export function cardmarketLangParam(language: string | null | undefined): string {
  if (!language) {
    return "";
  }
  const code = CARDMARKET_LANGUAGE_CODES[language.toUpperCase()];
  return code === undefined ? "" : `&language=${code}`;
}

interface MarketplaceLinks {
  label: string;
  searchUrl: (query: string) => string;
  productUrl: (productId: number, language?: string | null) => string;
  isAffiliate: boolean;
}

export const MARKETPLACE_LINKS: Record<Marketplace, MarketplaceLinks> = {
  tcgplayer: {
    label: "TCGplayer",
    searchUrl: (query) =>
      affiliateUrl(
        `https://www.tcgplayer.com/search/riftbound/product?q=${encodeURIComponent(query)}`,
      ),
    productUrl: (id) => affiliateUrl(`https://www.tcgplayer.com/product/${id}`),
    isAffiliate: true,
  },
  cardmarket: {
    label: "Cardmarket",
    searchUrl: (query) =>
      `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(query)}`,
    productUrl: (id, language) =>
      `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}${cardmarketLangParam(language)}`,
    isAffiliate: false,
  },
  cardtrader: {
    label: "CardTrader",
    searchUrl: (query) =>
      cardtraderAffiliateUrl(`https://www.cardtrader.com/en/search?q=${encodeURIComponent(query)}`),
    productUrl: (id) => cardtraderAffiliateUrl(`https://www.cardtrader.com/en/cards/${id}`),
    isAffiliate: true,
  },
};

export function marketplaceLabel(name: string): string {
  return MARKETPLACE_LINKS[name as Marketplace]?.label ?? name;
}
