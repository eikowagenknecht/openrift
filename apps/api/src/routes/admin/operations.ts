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
import { clearPricesSchema, priceRefreshResponseSchema } from "./schemas.js";

const log = createLogger("admin");

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
  });
