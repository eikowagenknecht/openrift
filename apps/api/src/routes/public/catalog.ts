import type { CatalogResponse } from "@openrift/shared";
import { catalogContract } from "@openrift/shared/contracts";
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
 * an array.
 *
 * The static parts (sets, cards, printings, custom-tag assignments) are
 * assembled by the shared `assembleCatalogStaticParts` (via
 * `assembleCatalogResponse`) — the exact same pure transform the synced web
 * client runs over Electric rows (ADR-027). `totalCopies` is the only dynamic
 * field merged in; prices live on a separate `/api/v1/prices` endpoint with
 * its own cache lifetime, so the catalog ETag stays stable across daily price
 * refreshes.
 */
export const catalogRouter = {
  catalog: os.catalog.handler(
    ({ context }): Promise<CatalogResponse> => assembleCatalogResponse(context.repos),
  ),
};
