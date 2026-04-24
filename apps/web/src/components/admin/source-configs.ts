import { cardmarketLangParam } from "@/lib/marketplace-language";

import type { SourceMappingConfig } from "./price-mappings-types";

export const CM_CONFIG: SourceMappingConfig = {
  source: "cardmarket",
  displayName: "Cardmarket",
  shortName: "CM",
  productUrl: (id, language) =>
    `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}${cardmarketLangParam(language)}`,
};

export const TCG_CONFIG: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  // TCGplayer's product page doesn't take a language query param (no language
  // is part of the product URL; a non-EN SKU would be a different productId).
  productUrl: (id) => `https://www.tcgplayer.com/product/${id}`,
};

export const CT_CONFIG: SourceMappingConfig = {
  source: "cardtrader",
  displayName: "CardTrader",
  shortName: "CT",
  // CardTrader handles language filtering at the listing level, not via product URL.
  productUrl: (id) => `https://www.cardtrader.com/en/cards/${id}`,
};
