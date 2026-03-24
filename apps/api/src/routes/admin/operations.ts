import { zValidator } from "@hono/zod-validator";
import type { ClearPricesResponse } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { Hono } from "hono";
import { z } from "zod/v4";

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

// ── Route ───────────────────────────────────────────────────────────────────

export const operationsRoute = new Hono<{ Variables: Variables }>()

  // ── Clear price data ─────────────────────────────────────────────────────────

  .post("/clear-prices", zValidator("json", clearPricesSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace } = c.req.valid("json");

    const { snapshots, sources, staging } = await mktAdmin.clearPriceData(marketplace);
    return c.json({
      marketplace,
      deleted: { snapshots, products: sources, staging },
    } satisfies ClearPricesResponse);
  })

  // ── Manual refresh endpoints ────────────────────────────────────────────────

  .post("/refresh-tcgplayer-prices", async (c) => {
    const result = await refreshTcgplayerPrices(c.get("io").fetch, c.get("repos"), log);
    return c.json(result);
  })

  .post("/refresh-cardmarket-prices", async (c) => {
    const result = await refreshCardmarketPrices(c.get("io").fetch, c.get("repos"), log);
    return c.json(result);
  })

  .post("/refresh-cardtrader-prices", async (c) => {
    const config = c.get("config");
    const result = await refreshCardtraderPrices(
      c.get("io").fetch,
      c.get("repos"),
      log,
      config.cardtraderApiToken,
    );
    return c.json(result);
  });
