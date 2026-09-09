import { priceLookupFromMap } from "@openrift/shared/price-lookup";
import type { PriceLookup, PriceMap } from "@openrift/shared/types/api/pricing";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Kysely } from "kysely";

import type { Database } from "../../db/tables.js";
import { createContentAddressedCache } from "../catalog/services/catalog-assembly.js";
import { cardmarketStockRepo } from "./repositories/cardmarket-stock.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { priceRefreshRepo } from "./repositories/price-refresh.js";
import { productsRepo } from "./repositories/products.js";
import { providerSettingsRepo } from "./repositories/provider-settings.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";

export interface MarketplaceRepos {
  marketplace: ReturnType<typeof marketplaceRepo>;
  cardmarketStock: ReturnType<typeof cardmarketStockRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  products: ReturnType<typeof productsRepo>;
  providerSettings: ReturnType<typeof providerSettingsRepo>;
  marketplaceMapping: ReturnType<typeof marketplaceMappingRepo>;
  priceRefresh: ReturnType<typeof priceRefreshRepo>;
}

export interface MarketplaceServices {
  getMappingOverview: typeof getMappingOverview;
}

export function createMarketplaceRepos(db: Kysely<Database>): MarketplaceRepos {
  return {
    marketplace: marketplaceRepo(db),
    cardmarketStock: cardmarketStockRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    products: productsRepo(db),
    providerSettings: providerSettingsRepo(db),
    marketplaceMapping: marketplaceMappingRepo(db),
    priceRefresh: priceRefreshRepo(db),
  };
}

export function createRulePriceLookup(db: Kysely<Database>): () => Promise<PriceLookup> {
  return createContentAddressedCache(
    async () => {
      const rows = await marketplaceRepo(db).latestPrices();
      const map: PriceMap = {};
      for (const row of rows) {
        (map[row.printingId] ??= {})[row.marketplace as Marketplace] = row.marketCents;
      }
      return priceLookupFromMap(map);
    },
    () => marketplaceRepo(db).latestPricesContentVersion(),
  );
}

export function createMarketplaceServices(): MarketplaceServices {
  return { getMappingOverview };
}
