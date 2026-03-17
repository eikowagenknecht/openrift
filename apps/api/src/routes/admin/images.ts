import { zValidator } from "@hono/zod-validator";
import { createLogger } from "@openrift/shared/logger";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import {
  clearAllRehosted,
  getRehostStatus,
  regenerateImages,
  rehostImages,
} from "../../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Schemas ─────────────────────────────────────────────────────────────────

const restoreImageUrlsSchema = z.object({
  source: z.string().min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const imagesRoute = new Hono<{ Variables: Variables }>()

  // ── Image rehosting ─────────────────────────────────────────────────────────

  .post(
    "/admin/rehost-images",
    zValidator("query", z.object({ limit: z.coerce.number().int().min(1).optional() })),
    async (c) => {
      const { printingImages } = c.get("repos");
      const limit = c.req.valid("query").limit ?? 10;
      try {
        const result = await rehostImages(c.get("io"), printingImages, limit);
        return c.json(result);
      } catch (error) {
        log.error(error, "rehost-images failed");
        throw new AppError(500, "INTERNAL_ERROR", "Image rehosting failed");
      }
    },
  )

  .post(
    "/admin/regenerate-images",
    zValidator("query", z.object({ offset: z.coerce.number().int().min(0).optional() })),
    async (c) => {
      const offset = c.req.valid("query").offset ?? 0;
      try {
        const result = await regenerateImages(c.get("io"), offset);
        return c.json(result);
      } catch (error) {
        log.error(error, "regenerate-images failed");
        throw new AppError(500, "INTERNAL_ERROR", "Image regeneration failed");
      }
    },
  )

  .post("/admin/clear-rehosted", async (c) => {
    const { printingImages } = c.get("repos");
    try {
      const result = await clearAllRehosted(c.get("io"), printingImages);
      return c.json(result);
    } catch (error) {
      log.error(error, "clear-rehosted failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to clear rehosted images");
    }
  })

  .get("/admin/rehost-status", async (c) => {
    const { printingImages } = c.get("repos");
    try {
      const result = await getRehostStatus(c.get("io"), printingImages);
      return c.json(result);
    } catch (error) {
      log.error(error, "rehost-status failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to get rehost status");
    }
  })

  // ── Restore original URLs from a card source ──────────────────────────────

  .post("/admin/restore-image-urls", zValidator("json", restoreImageUrlsSchema), async (c) => {
    const { printingImages } = c.get("repos");
    const { source } = c.req.valid("json");

    try {
      const updated = await printingImages.restoreFromSources(source);
      return c.json({ source, updated });
    } catch (error) {
      log.error(error, "restore-image-urls failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to restore image URLs");
    }
  });
