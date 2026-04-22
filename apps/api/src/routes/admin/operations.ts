import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ClearPricesResponse, ReconcileSnapshotsResponse } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { z } from "zod";

import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import type { Variables } from "../../types.js";
import {
  clearPricesSchema,
  priceRefreshResponseSchema,
  reconcileSnapshotsResponseSchema,
  reconcileSnapshotsSchema,
} from "./schemas.js";

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
            marketplace: z.string().openapi({ example: "cardmarket" }),
            deleted: z.object({
              snapshots: z.number().openapi({ example: 4821 }),
              variants: z.number().openapi({ example: 468 }),
              products: z.number().openapi({ example: 312 }),
              staging: z.number().openapi({ example: 468 }),
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

const refreshMatviews = createRoute({
  method: "post",
  path: "/refresh-materialized-views",
  tags: ["Admin - Operations"],
  responses: {
    204: { description: "All materialized views refreshed" },
  },
});

const reconcileSnapshots = createRoute({
  method: "post",
  path: "/reconcile-snapshots",
  tags: ["Admin - Operations"],
  request: {
    body: { content: { "application/json": { schema: reconcileSnapshotsSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: reconcileSnapshotsResponseSchema } },
      description: "Snapshots reconciled from staging",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const operationsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── Clear price data ─────────────────────────────────────────────────────────

  .openapi(clearPrices, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace } = c.req.valid("json");

    const { snapshots, variants, products, staging } = await mktAdmin.clearPriceData(marketplace);
    return c.json({
      marketplace,
      deleted: { snapshots, variants, products, staging },
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

  // ── Refresh materialized views ──────────────────────────────────────────────

  .openapi(refreshMatviews, async (c) => {
    const { marketplace, catalog } = c.get("repos");
    await Promise.all([marketplace.refreshLatestPrices(), catalog.refreshCardAggregates()]);
    return c.body(null, 204);
  })

  // ── Reconcile snapshots ─────────────────────────────────────────────────────

  .openapi(reconcileSnapshots, async (c) => {
    const { marketplaceAdmin: mktAdmin, marketplace } = c.get("repos");
    const { marketplace: mp } = c.req.valid("json");

    const snapshotsInserted = await mktAdmin.reconcileStagingSnapshots(mp);
    if (snapshotsInserted > 0) {
      await marketplace.refreshLatestPrices();
    }
    return c.json({ marketplace: mp, snapshotsInserted } satisfies ReconcileSnapshotsResponse);
  });
