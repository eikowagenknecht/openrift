import { oc } from "@orpc/contract";

import { promosListResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public promos page.
 * `GET /api/v1/promos` — all distribution channels (event + product) with their
 * printings and cards. Edge-cached (ETag via the mount's `etag()`).
 */
export const promosContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/promos", tags: ["Promos"] })
    .meta({ auth: "public" })
    .output(promosListResponseSchema),
};

export type PromosContract = typeof promosContract;
