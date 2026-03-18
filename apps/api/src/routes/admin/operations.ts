import { zValidator } from "@hono/zod-validator";
import type { ClearPricesResponse } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { Hono } from "hono";
import { z } from "zod/v4";

import {
  refreshCardmarketPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Schemas ─────────────────────────────────────────────────────────────────

const clearPriceSourceSchema = z.enum(["tcgplayer", "cardmarket"]);

const clearPricesSchema = z.object({
  source: clearPriceSourceSchema,
});

// ── Route ───────────────────────────────────────────────────────────────────

export const operationsRoute = new Hono<{ Variables: Variables }>()

  // ── Clear price data ─────────────────────────────────────────────────────────

  .post("/clear-prices", zValidator("json", clearPricesSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { source } = c.req.valid("json");

    const deleted = await mktAdmin.clearPriceData(source);
    return c.json({ source, deleted } satisfies ClearPricesResponse);
  })

  // ── Manual refresh endpoints ────────────────────────────────────────────────

  .post("/refresh-tcgplayer-prices", async (c) => {
    const db = c.get("db");
    const result = await refreshTcgplayerPrices(c.get("io").fetch, db, log);
    return c.json(result);
  })

  .post("/refresh-cardmarket-prices", async (c) => {
    const db = c.get("db");
    const result = await refreshCardmarketPrices(c.get("io").fetch, db, log);
    return c.json(result);
  });
