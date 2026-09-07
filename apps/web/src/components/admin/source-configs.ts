import { MARKETPLACE_LINKS } from "@openrift/shared/marketplace";

import type { SourceMappingConfig } from "@/lib/price-mappings-types";

export const CM_CONFIG: SourceMappingConfig = {
  source: "cardmarket",
  displayName: MARKETPLACE_LINKS.cardmarket.label,
  shortName: "CM",
  productUrl: MARKETPLACE_LINKS.cardmarket.productUrl,
};

export const TCG_CONFIG: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: MARKETPLACE_LINKS.tcgplayer.label,
  shortName: "TCG",
  // TCGplayer's product page doesn't take a language query param (no language
  // is part of the product URL; a non-EN SKU would be a different productId).
  productUrl: MARKETPLACE_LINKS.tcgplayer.productUrl,
};

export const CT_CONFIG: SourceMappingConfig = {
  source: "cardtrader",
  displayName: MARKETPLACE_LINKS.cardtrader.label,
  shortName: "CT",
  // CardTrader handles language filtering at the listing level, not via product URL.
  productUrl: MARKETPLACE_LINKS.cardtrader.productUrl,
};
