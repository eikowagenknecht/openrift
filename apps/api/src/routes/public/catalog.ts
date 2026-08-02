import type { CatalogResponse } from "@openrift/shared";
import { catalogContract } from "@openrift/shared/contracts/catalog";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assembleCatalogResponse } from "../../services/catalog-assembly.js";

const os = implement(catalogContract).$context<ApiContext>().use(requireUser);

/**
 * `GET /catalog`.
 *
 * Cards and printings are both returned as maps keyed by their own id; the id
 * is therefore omitted from each value (identity lives in the key). Sets stay
 * an array. Prices live on a separate `/api/v1/prices` endpoint with its own
 * cache lifetime, so the catalog ETag stays stable across daily price refreshes.
 */
export const catalogRouter = {
  catalog: os.catalog.handler(
    ({ context }): Promise<CatalogResponse> => assembleCatalogResponse(context.repos),
  ),
};
