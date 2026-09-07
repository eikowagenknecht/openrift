import type { MarketplaceGroupKind } from "@openrift/shared/types/api/admin";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: Marketplace;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  groupKind: Generated<MarketplaceGroupKind>;
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceProductsTable {
  id: Generated<string>;
  marketplace: Marketplace;
  externalId: number;
  groupId: number;
  productName: string;
  normName: Generated<string>;
  finish: string;
  language: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceProductVariantsTable {
  id: Generated<string>;
  marketplaceProductId: string;
  printingId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceProductPricesTable {
  marketplaceProductId: string;
  recordedAt: Date;
  marketCents: number | null;
  lowCents: number | null;
  zeroLowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  createdAt: CreatedAt;
}

export interface MarketplaceIgnoredProductsTable {
  marketplace: Marketplace;
  externalId: number;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceIgnoredVariantsTable {
  marketplaceProductId: string;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceProductCardOverridesTable {
  marketplaceProductId: string;
  cardId: string;
  createdAt: CreatedAt;
}

export interface ProductsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ProductPrintingsTable {
  productId: string;
  printingId: string;
  quantity: number;
}
