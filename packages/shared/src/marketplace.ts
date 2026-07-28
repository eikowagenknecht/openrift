import type { Marketplace } from "./types/index.js";

const AFFILIATE_BASE = "https://partner.tcgplayer.com/openrift";

/**
 * Wraps a TCGplayer URL in the partner redirect that carries our affiliate id.
 * @returns The partner redirect URL targeting the given TCGplayer page.
 */
export function affiliateUrl(url: string): string {
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(url)}`;
}

const CT_SHARE_CODE = "openrift";

/**
 * Appends our CardTrader share code to a CardTrader URL.
 * @returns The URL with the `share_code` query param attached.
 */
export function cardtraderAffiliateUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}share_code=${CT_SHARE_CODE}`;
}

/**
 * Cardmarket's numeric language ids for the subset of languages our catalog
 * actually uses. Values taken from Cardmarket's public documentation.
 *
 * Keys are Cardmarket's own codes plus the printing codes we map onto them.
 * Nothing in the catalog distinguishes traditional Chinese today, so `ZH-TW`
 * is here only to keep the id table faithful to Cardmarket's list.
 */
const CARDMARKET_LANGUAGE_CODES: Record<string, number> = {
  EN: 1,
  FR: 2,
  DE: 3,
  ES: 4,
  IT: 5,
  "ZH-CN": 6,
  SC: 6, // printings.language stores Riot's "SC" for CM's simplified Chinese
  ZH: 6, // legacy: pre-SC preferences and bookmarked URLs still carry "ZH"
  JA: 7,
  PT: 8,
  RU: 9,
  KO: 10,
  "ZH-TW": 11,
};

/**
 * Returns the CM `&language=N` query fragment for a given printing language,
 * or an empty string when the language is unknown/missing. Cardmarket is the
 * only marketplace whose product page takes a language query param —
 * TCGplayer's URL scheme treats each language as a distinct productId, and
 * CardTrader handles language at the listing level.
 *
 * @returns The query fragment to append to the existing Cardmarket URL,
 *          including the leading `&`.
 */
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
}

export const MARKETPLACE_LINKS: Record<Marketplace, MarketplaceLinks> = {
  tcgplayer: {
    label: "TCGplayer",
    searchUrl: (query) =>
      affiliateUrl(
        `https://www.tcgplayer.com/search/riftbound/product?q=${encodeURIComponent(query)}`,
      ),
    productUrl: (id) => affiliateUrl(`https://www.tcgplayer.com/product/${id}`),
  },
  cardmarket: {
    label: "Cardmarket",
    searchUrl: (query) =>
      `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(query)}`,
    productUrl: (id, language) =>
      `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}${cardmarketLangParam(language)}`,
  },
  cardtrader: {
    label: "CardTrader",
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
  return MARKETPLACE_LINKS[name as Marketplace]?.label ?? name;
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
