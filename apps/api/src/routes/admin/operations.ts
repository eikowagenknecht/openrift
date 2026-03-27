import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ClearPricesResponse } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { z } from "zod";

import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Schemas ─────────────────────────────────────────────────────────────────

const clearPriceMarketplaceSchema = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

const clearPricesSchema = z.object({
  marketplace: clearPriceMarketplaceSchema,
});

const fixTypographySchema = z.object({ dryRun: z.boolean().default(true) });

const upsertCountsSchema = z.object({
  total: z.number(),
  new: z.number(),
  updated: z.number(),
  unchanged: z.number(),
});

const priceRefreshResponseSchema = z.object({
  transformed: z.object({
    groups: z.number(),
    products: z.number(),
    prices: z.number(),
  }),
  upserted: z.object({
    snapshots: upsertCountsSchema,
    staging: upsertCountsSchema,
  }),
});

// ── Route definitions ───────────────────────────────────────────────────────

const clearPrices = createRoute({
  method: "post",
  path: "/clear-prices",
  tags: ["Admin - Operations"],
  request: {
    body: { content: { "application/json": { schema: clearPricesSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            marketplace: z.string(),
            deleted: z.object({
              snapshots: z.number(),
              products: z.number(),
              staging: z.number(),
            }),
          }),
        },
      },
      description: "Price data cleared",
    },
  },
});

const refreshTcgplayer = createRoute({
  method: "post",
  path: "/refresh-tcgplayer-prices",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: { "application/json": { schema: priceRefreshResponseSchema } },
      description: "TCGPlayer prices refreshed",
    },
  },
});

const refreshCardmarket = createRoute({
  method: "post",
  path: "/refresh-cardmarket-prices",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: { "application/json": { schema: priceRefreshResponseSchema } },
      description: "Cardmarket prices refreshed",
    },
  },
});

const refreshCardtrader = createRoute({
  method: "post",
  path: "/refresh-cardtrader-prices",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: { "application/json": { schema: priceRefreshResponseSchema } },
      description: "Cardtrader prices refreshed",
    },
  },
});

const fixTypography = createRoute({
  method: "post",
  path: "/fix-typography",
  tags: ["Admin - Operations"],
  request: {
    body: { content: { "application/json": { schema: fixTypographySchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ affectedCount: z.number() }) },
      },
      description: "Typography fix result",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const operationsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── Clear price data ─────────────────────────────────────────────────────────

  .openapi(clearPrices, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace } = c.req.valid("json");

    const { snapshots, sources, staging } = await mktAdmin.clearPriceData(marketplace);
    return c.json({
      marketplace,
      deleted: { snapshots, products: sources, staging },
    } satisfies ClearPricesResponse);
  })

  // ── Manual refresh endpoints ────────────────────────────────────────────────

  .openapi(refreshTcgplayer, async (c) => {
    const result = await refreshTcgplayerPrices(c.get("io").fetch, c.get("repos"), log);
    return c.json(result);
  })

  .openapi(refreshCardmarket, async (c) => {
    const result = await refreshCardmarketPrices(c.get("io").fetch, c.get("repos"), log);
    return c.json(result);
  })

  .openapi(refreshCardtrader, async (c) => {
    const config = c.get("config");
    const result = await refreshCardtraderPrices(
      c.get("io").fetch,
      c.get("repos"),
      log,
      config.cardtraderApiToken,
    );
    return c.json(result);
  })

  // ── Fix typography ──────────────────────────────────────────────────────────

  .openapi(fixTypography, async (c) => {
    const { catalog } = c.get("repos");
    const { dryRun } = c.req.valid("json");

    const affectedCount = await catalog.fixTypography(dryRun);
    if (!dryRun) {
      log.info(`fix-typography: updated ${String(affectedCount)} rows`);
    }

    return c.json({ affectedCount });
  });
