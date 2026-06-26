import { oc } from "@orpc/contract";

import { collectionValueHistoryResponseSchema } from "../response-schemas.js";
import { collectionValueHistoryQuerySchema } from "../schemas.js";

/**
 * oRPC contract for the authenticated collection value-over-time series.
 * `GET /api/v1/collection-value-history?marketplace&range&...scope` — a time
 * series of collection value. Requires a session (mount applies `requireAuth`).
 */
export const collectionValueHistoryContract = {
  get: oc
    .route({
      method: "GET",
      path: "/api/v1/collection-value-history",
      tags: ["Collection Value History"],
    })
    .input(collectionValueHistoryQuerySchema)
    .output(collectionValueHistoryResponseSchema),
};

export type CollectionValueHistoryContract = typeof collectionValueHistoryContract;
