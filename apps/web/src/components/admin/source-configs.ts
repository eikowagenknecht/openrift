import type { SourceMappingConfig } from "./price-mappings-types";

export const CM_CONFIG: SourceMappingConfig = {
  source: "cardmarket",
  displayName: "Cardmarket",
  shortName: "CM",
  productUrl: (id) => `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}`,
  apiPath: "/api/admin/cardmarket-mappings",
};

export const TCG_CONFIG: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  productUrl: (id) => `https://www.tcgplayer.com/product/${id}`,
  apiPath: "/api/admin/tcgplayer-mappings",
};
