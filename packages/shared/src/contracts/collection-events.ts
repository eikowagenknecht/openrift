import { oc } from "@orpc/contract";

import { collectionEventListResponseSchema } from "../response-schemas.js";
import { collectionEventsQuerySchema } from "../schemas.js";

/**
 * oRPC contract for the authenticated collection-events feed.
 * `GET /api/v1/collection-events?cursor&limit` — cursor-paginated activity.
 * Requires a session (the mount applies `requireAuth`).
 */
export const collectionEventsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/collection-events", tags: ["Collection Events"] })
    .input(collectionEventsQuerySchema)
    .output(collectionEventListResponseSchema),
};

export type CollectionEventsContract = typeof collectionEventsContract;
