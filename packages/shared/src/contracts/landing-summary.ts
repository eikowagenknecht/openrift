import { oc } from "@orpc/contract";

import { landingSummaryResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public landing-summary endpoint.
 *
 * `GET /api/v1/landing-summary` — the lightweight hero payload (counts + a
 * per-day-stable thumbnail sample). Edge-cached; the ETag is produced by the
 * Hono `etag()` middleware around the mounted handler, not by the contract.
 */
export const landingSummaryContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/landing-summary", tags: ["Catalog"] })
    .meta({ auth: "public" })
    .output(landingSummaryResponseSchema),
};

export type LandingSummaryContract = typeof landingSummaryContract;
