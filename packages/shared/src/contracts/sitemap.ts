import { oc } from "@orpc/contract";

import { sitemapDataResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public sitemap-data endpoint.
 * `GET /api/v1/sitemap-data` — all card + set slugs with `updatedAt` for the
 * web's sitemap generator. Edge-cached (ETag via the mount's `etag()`).
 */
export const sitemapContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/sitemap-data", tags: ["Sitemap"] })
    .meta({ auth: "public" })
    .output(sitemapDataResponseSchema),
};

export type SitemapContract = typeof sitemapContract;
