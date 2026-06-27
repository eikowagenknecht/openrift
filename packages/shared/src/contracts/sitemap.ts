import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

const sitemapEntrySchema = z.object({
  slug: z.string().openapi({ example: "jinx-rebel" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T12:00:00.000Z" }),
});

export const sitemapDataResponseSchema = z
  .object({
    cards: z.array(sitemapEntrySchema),
    sets: z.array(sitemapEntrySchema),
  })
  .openapi("SitemapDataResponse");

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
