import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { LandingSummaryResponse } from "@openrift/shared";
import { landingSummaryResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";

// Cap the scatter at desktop's full deck (36 cards) — mobile uses fewer.
const THUMBNAIL_SAMPLE_SIZE = 36;

const getLandingSummary = createRoute({
  method: "get",
  path: "/landing-summary",
  tags: ["Catalog"],
  responses: {
    200: {
      content: { "application/json": { schema: landingSummaryResponseSchema } },
      description: "Lightweight payload for the public landing page",
    },
  },
});

const landingSummaryApp = new OpenAPIHono<{ Variables: Variables }>();
landingSummaryApp.use("/landing-summary", etag());
export const landingSummaryRoute = landingSummaryApp
  /**
   * `GET /landing-summary` — Lightweight payload for the public landing page.
   *
   * Returns the four values the hero actually consumes: card count, printing
   * count, copy count, and a per-day-stable sample of front-face non-landscape
   * thumbnail URLs for the decorative card scatter. The full `/catalog`
   * response is ~310 KB; this is a fraction of that since it skips card and
   * set metadata entirely.
   */
  .openapi(getLandingSummary, async (c) => {
    const { catalog } = c.get("repos");
    const summary = await catalog.landingSummary(THUMBNAIL_SAMPLE_SIZE);

    const content: LandingSummaryResponse = {
      cardCount: summary.cardCount,
      printingCount: summary.printingCount,
      copyCount: summary.copyCount,
      thumbnailIds: summary.thumbnailIds,
    };

    // Match /catalog so Cloudflare can serve from the edge with the same
    // SWR window. The deterministic per-day shuffle keeps the body identical
    // for every visitor across a UTC day.
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  });
