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
  // TCGplayer is effectively English-only for Riftbound, so no language filter applies.
  productUrl: (id) => `https://www.tcgplayer.com/product/${id}`,
};

export const CT_CONFIG: SourceMappingConfig = {
  source: "cardtrader",
  displayName: "CardTrader",
  shortName: "CT",
  // CardTrader handles language filtering at the listing level, not via product URL.
  productUrl: (id) => `https://www.cardtrader.com/en/cards/${id}`,
};
