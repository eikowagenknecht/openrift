import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { marketplaceCollectionValueHistoryRepo } from "./marketplace-collection-value-history.js";
import { marketplaceCollectionValueRepo } from "./marketplace-collection-value.js";
import { marketplacePricesRepo } from "./marketplace-prices.js";

export type { CollectionValue } from "./marketplace-collection-value.js";

export function marketplaceRepo(db: Kysely<Database>) {
  return {
    ...marketplacePricesRepo(db),
    ...marketplaceCollectionValueRepo(db),
    ...marketplaceCollectionValueHistoryRepo(db),
  };
}
