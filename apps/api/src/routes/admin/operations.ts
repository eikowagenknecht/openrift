import { zValidator } from "@hono/zod-validator";
import { createLogger } from "@openrift/shared/logger";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import { requireAdmin } from "../../middleware/require-admin.js";
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

  .use("/admin/clear-prices", requireAdmin)
  .post("/admin/clear-prices", zValidator("json", clearPricesSchema), async (c) => {
    const db = c.get("db");
    const { source } = c.req.valid("json");

    try {
      // Delete snapshots for this marketplace (via source_id join)
      const snapshots = await db
        .deleteFrom("marketplaceSnapshots")
        .where(
          "sourceId",
          "in",
          db.selectFrom("marketplaceSources").select("id").where("marketplace", "=", source),
        )
        .execute();

      const sources = await db
        .deleteFrom("marketplaceSources")
        .where("marketplace", "=", source)
        .execute();

      const staging = await db
        .deleteFrom("marketplaceStaging")
        .where("marketplace", "=", source)
        .execute();

      return c.json({
        status: "ok",
        result: {
          source,
          deleted: {
            snapshots: Number(snapshots[0].numDeletedRows),
            sources: Number(sources[0].numDeletedRows),
            staging: Number(staging[0].numDeletedRows),
          },
        },
      });
    } catch (error) {
      log.error(error, `clear-prices (${source}) failed`);
      throw new AppError(500, "INTERNAL_ERROR", `Failed to clear ${source} price data`);
    }
  })

  // ── Manual refresh endpoints ────────────────────────────────────────────────

  .use("/admin/refresh-tcgplayer-prices", requireAdmin)
  .post("/admin/refresh-tcgplayer-prices", async (c) => {
    const db = c.get("db");
    try {
      const result = await refreshTcgplayerPrices(db, log.child({ service: "tcgplayer" }));
      return c.json({ status: "ok", result });
    } catch (error) {
      log.error(error, "refresh-tcgplayer-prices failed");
      throw new AppError(500, "INTERNAL_ERROR", "TCGPlayer price refresh failed");
    }
  })

  .use("/admin/refresh-cardmarket-prices", requireAdmin)
  .post("/admin/refresh-cardmarket-prices", async (c) => {
    const db = c.get("db");
    try {
      const result = await refreshCardmarketPrices(db, log.child({ service: "cardmarket" }));
      return c.json({ status: "ok", result });
    } catch (error) {
      log.error(error, "refresh-cardmarket-prices failed");
      throw new AppError(500, "INTERNAL_ERROR", "Cardmarket price refresh failed");
    }
  });
