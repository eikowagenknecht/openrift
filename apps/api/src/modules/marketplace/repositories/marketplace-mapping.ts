import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { marketplaceMappingCardsRepo } from "./marketplace-mapping-cards.js";
import { marketplaceMappingStagingRepo } from "./marketplace-mapping-staging.js";
import { marketplaceMappingVariantsRepo } from "./marketplace-mapping-variants.js";

export function marketplaceMappingRepo(db: Kysely<Database>) {
  return {
    ...marketplaceMappingStagingRepo(db),
    ...marketplaceMappingCardsRepo(db),
    ...marketplaceMappingVariantsRepo(db),
  };
}
