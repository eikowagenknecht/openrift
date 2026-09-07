import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const sitemapEntrySchema = z.object({
  slug: z.string().openapi({ example: "jinx-rebel" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T12:00:00.000Z" }),
});

export const sitemapDataResponseSchema = z
  .object({
    cards: z.array(sitemapEntrySchema),
    sets: z.array(sitemapEntrySchema),
    products: z.array(sitemapEntrySchema),
    metaEvents: z.array(sitemapEntrySchema),
    metaDecks: z.array(sitemapEntrySchema),
    metaLegends: z.array(sitemapEntrySchema),
    metaPlayers: z.array(sitemapEntrySchema),
  })
  .openapi("SitemapDataResponse");

export const sitemapContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/sitemap-data", tags: ["Sitemap"] })
    .meta({ auth: "public", cache: "sitemap", etag: true })
    .output(sitemapDataResponseSchema),
};

export type SitemapContract = typeof sitemapContract;
