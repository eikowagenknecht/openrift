import { oc } from "@orpc/contract";

import { initResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public init (bootstrap) endpoint.
 * `GET /api/v1/init` — enums, keywords, distribution channels and custom tags
 * in one request. Edge-cached (ETag via the mount's `etag()`).
 */
export const initContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/init", tags: ["Init"] })
    .meta({ auth: "public" })
    .output(initResponseSchema),
};

export type InitContract = typeof initContract;
