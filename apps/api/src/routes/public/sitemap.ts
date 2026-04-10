import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { SitemapDataResponse } from "@openrift/shared";
import { sitemapDataResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";

const getSitemapData = createRoute({
  method: "get",
  path: "/sitemap-data",
  tags: ["Sitemap"],
  responses: {
    200: {
      content: { "application/json": { schema: sitemapDataResponseSchema } },
      description: "All cards and sets with updatedAt for sitemap generation",
    },
  },
});

const sitemapApp = new OpenAPIHono<{ Variables: Variables }>();
sitemapApp.use("/sitemap-data", etag());
export const sitemapDataRoute = sitemapApp
  /**
   * `GET /sitemap-data` — Returns all card and set entries (slug + updatedAt) for sitemap generation.
   *
   * @returns The sitemap data response with card and set entries.
   */
  .openapi(getSitemapData, async (c) => {
    const { catalog } = c.get("repos");

    const [cards, sets] = await Promise.all([
      catalog.allCardSitemapEntries(),
      catalog.allSetSitemapEntries(),
    ]);

    const content: SitemapDataResponse = { cards, sets };
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=7200");
    return c.json(content);
  });
