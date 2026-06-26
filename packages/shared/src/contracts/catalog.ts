import { oc } from "@orpc/contract";
import { z } from "zod";

import { catalogResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public card catalog (`GET /api/v1/catalog`). The `v`
 * query param is a cache-buster the web appends (the catalog's current ETag) so
 * a content change rolls the edge-cache URL; the handler ignores it. Long-lived
 * edge cache + ETag are applied by the mount's Hono `etag()` middleware.
 */
export const catalogContract = {
  catalog: oc
    .route({ method: "GET", path: "/api/v1/catalog", tags: ["Catalog"] })
    .meta({ auth: "public" })
    .input(z.object({ v: z.string().optional() }))
    .output(catalogResponseSchema),
};

export type CatalogContract = typeof catalogContract;
