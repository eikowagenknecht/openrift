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
      description: "All slugs for sitemap generation",
    },
  },
});

const sitemapApp = new OpenAPIHono<{ Variables: Variables }>();
sitemapApp.use("/sitemap-data", etag());
export const sitemapDataRoute = sitemapApp
  /**
   * `GET /sitemap-data` — Returns all card and set slugs for sitemap generation.
   */
  .openapi(getSitemapData, async (c) => {
    const { catalog } = c.get("repos");

    const [cardSlugs, setSlugs] = await Promise.all([
      catalog.allCardSlugs(),
      catalog.allSetSlugs(),
    ]);

    const content: SitemapDataResponse = { cardSlugs, setSlugs };
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=7200");
    return c.json(content);
  });
