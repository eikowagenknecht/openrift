import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { catalogCardsRepo } from "./catalog-cards.js";
import { catalogLandingRepo } from "./catalog-landing.js";
import { catalogPrintingsRepo } from "./catalog-printings.js";
import { catalogRefreshRepo } from "./catalog-refresh.js";
import { catalogSetsRepo } from "./catalog-sets.js";
import { catalogVersionsRepo } from "./catalog-versions.js";

/**
 * The `.select()` columns in each method define the public API contract —
 * the catalog route spreads these rows directly into the response. Only
 * select columns that are safe to expose to clients.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    ...catalogSetsRepo(db),
    ...catalogCardsRepo(db),
    ...catalogPrintingsRepo(db),
    ...catalogVersionsRepo(db),
    ...catalogLandingRepo(db),
    ...catalogRefreshRepo(db),
  };
}
