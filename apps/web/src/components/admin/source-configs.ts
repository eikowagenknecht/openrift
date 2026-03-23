import type { SourceMappingConfig } from "./price-mappings-types";

export const CM_CONFIG: SourceMappingConfig = {
  source: "cardmarket",
  displayName: "Cardmarket",
  shortName: "CM",
  productUrl: (id) => `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}`,
};

export const TCG_CONFIG: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  productUrl: (id) => `https://www.tcgplayer.com/product/${id}`,
};

export const CT_CONFIG: SourceMappingConfig = {
  source: "cardtrader",
  displayName: "CardTrader",
  shortName: "CT",
  productUrl: (id) => `https://www.cardtrader.com/en/riftbound/cards/${id}`,
};
