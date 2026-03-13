import { createLogger } from "@openrift/shared/logger";
import { refreshCardmarketPrices } from "@openrift/shared/services/refresh-cardmarket-prices";
import { refreshTcgplayerPrices } from "@openrift/shared/services/refresh-tcgplayer-prices";
import { Hono } from "hono";
import { sql } from "kysely";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getRehostStatus, regenerateImages, rehostImages } from "../../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

export const operationsRoute = new Hono<{ Variables: Variables }>();

const log = createLogger("admin");

// ── Clear price data ─────────────────────────────────────────────────────────

const clearPriceSourceSchema = z.enum(["tcgplayer", "cardmarket"]);

operationsRoute.use("/admin/clear-prices", requireAdmin);
operationsRoute.post("/admin/clear-prices", async (c) => {
  const body = await c.req.json();
  const source = clearPriceSourceSchema.parse(body.source);

  try {
    // Delete snapshots for this marketplace (via source_id join)
    const snapshots = await sql`
      DELETE FROM marketplace_snapshots
      WHERE source_id IN (
        SELECT id FROM marketplace_sources WHERE marketplace = ${source}
      )
    `.execute(db);

    const sources = await db
      .deleteFrom("marketplace_sources")
      .where("marketplace", "=", source)
      .execute();

    const staging = await db
      .deleteFrom("marketplace_staging")
      .where("marketplace", "=", source)
      .execute();

    return c.json({
      status: "ok",
      result: {
        source,
        deleted: {
          snapshots: Number(snapshots.numAffectedRows ?? 0),
          sources: Number(sources[0].numDeletedRows),
          staging: Number(staging[0].numDeletedRows),
        },
      },
    });
  } catch (error) {
    log.error(error, `clear-prices (${source}) failed`);
    throw new AppError(500, "INTERNAL_ERROR", `Failed to clear ${source} price data`);
  }
});

// ── Manual refresh endpoints ────────────────────────────────────────────────

operationsRoute.use("/admin/refresh-tcgplayer-prices", requireAdmin);
operationsRoute.post("/admin/refresh-tcgplayer-prices", async (c) => {
  try {
    const result = await refreshTcgplayerPrices(db, log.child({ service: "tcgplayer" }));
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "refresh-tcgplayer-prices failed");
    throw new AppError(500, "INTERNAL_ERROR", "TCGPlayer price refresh failed");
  }
});

operationsRoute.use("/admin/refresh-cardmarket-prices", requireAdmin);
operationsRoute.post("/admin/refresh-cardmarket-prices", async (c) => {
  try {
    const result = await refreshCardmarketPrices(db, log.child({ service: "cardmarket" }));
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "refresh-cardmarket-prices failed");
    throw new AppError(500, "INTERNAL_ERROR", "Cardmarket price refresh failed");
  }
});

// ── Image rehosting ─────────────────────────────────────────────────────────

operationsRoute.use("/admin/rehost-images", requireAdmin);
operationsRoute.post("/admin/rehost-images", async (c) => {
  try {
    const result = await rehostImages(db);
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "rehost-images failed");
    throw new AppError(500, "INTERNAL_ERROR", "Image rehosting failed");
  }
});

operationsRoute.use("/admin/regenerate-images", requireAdmin);
operationsRoute.post("/admin/regenerate-images", async (c) => {
  const offset = Number(c.req.query("offset") ?? 0);
  try {
    const result = await regenerateImages(offset);
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "regenerate-images failed");
    throw new AppError(500, "INTERNAL_ERROR", "Image regeneration failed");
  }
});

operationsRoute.use("/admin/rehost-status", requireAdmin);
operationsRoute.get("/admin/rehost-status", async (c) => {
  try {
    const result = await getRehostStatus(db);
    return c.json(result);
  } catch (error) {
    log.error(error, "rehost-status failed");
    throw new AppError(500, "INTERNAL_ERROR", "Failed to get rehost status");
  }
});
