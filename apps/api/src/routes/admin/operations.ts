import { createLogger } from "@openrift/shared/logger";
import { refreshCardmarketPrices } from "@openrift/shared/services/refresh-cardmarket-prices";
import { refreshCatalog } from "@openrift/shared/services/refresh-catalog";
import { refreshTcgplayerPrices } from "@openrift/shared/services/refresh-tcgplayer-prices";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
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
  const parsed = clearPriceSourceSchema.safeParse(body.source);
  if (!parsed.success) {
    return c.json({ error: "Invalid source — must be 'tcgplayer' or 'cardmarket'" }, 400);
  }
  const source = parsed.data;

  try {
    if (source === "tcgplayer") {
      const snapshots = await db.deleteFrom("tcgplayer_snapshots").execute();
      const sources = await db.deleteFrom("tcgplayer_sources").execute();
      const staging = await db.deleteFrom("tcgplayer_staging").execute();
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
    }
    const snapshots = await db.deleteFrom("cardmarket_snapshots").execute();
    const sources = await db.deleteFrom("cardmarket_sources").execute();
    const staging = await db.deleteFrom("cardmarket_staging").execute();
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
    return c.json({ error: `Failed to clear ${source} price data` }, 500);
  }
});

// ── Manual refresh endpoints ────────────────────────────────────────────────

operationsRoute.use("/admin/refresh-catalog", requireAdmin);
operationsRoute.post("/admin/refresh-catalog", async (c) => {
  const dryRun = c.req.query("dry_run") === "true";
  try {
    const result = await refreshCatalog(db, log.child({ service: "catalog" }), { dryRun });
    return c.json({ status: "ok", dryRun, result });
  } catch (error) {
    log.error(error, "refresh-catalog failed");
    return c.json({ error: "Catalog refresh failed" }, 500);
  }
});

operationsRoute.use("/admin/refresh-tcgplayer-prices", requireAdmin);
operationsRoute.post("/admin/refresh-tcgplayer-prices", async (c) => {
  try {
    const result = await refreshTcgplayerPrices(db, log.child({ service: "tcgplayer" }));
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "refresh-tcgplayer-prices failed");
    return c.json({ error: "TCGPlayer price refresh failed" }, 500);
  }
});

operationsRoute.use("/admin/refresh-cardmarket-prices", requireAdmin);
operationsRoute.post("/admin/refresh-cardmarket-prices", async (c) => {
  try {
    const result = await refreshCardmarketPrices(db, log.child({ service: "cardmarket" }));
    return c.json({ status: "ok", result });
  } catch (error) {
    log.error(error, "refresh-cardmarket-prices failed");
    return c.json({ error: "Cardmarket price refresh failed" }, 500);
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
    return c.json({ error: "Image rehosting failed" }, 500);
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
    return c.json({ error: "Image regeneration failed" }, 500);
  }
});

operationsRoute.use("/admin/rehost-status", requireAdmin);
operationsRoute.get("/admin/rehost-status", async (c) => {
  try {
    const result = await getRehostStatus(db);
    return c.json(result);
  } catch (error) {
    log.error(error, "rehost-status failed");
    return c.json({ error: "Failed to get rehost status" }, 500);
  }
});
