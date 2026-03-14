import { zValidator } from "@hono/zod-validator";
import { createLogger } from "@openrift/shared/logger";
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
import {
  clearAllRehosted,
  getRehostStatus,
  regenerateImages,
  rehostImages,
} from "../../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

const log = createLogger("admin");

const restoreImageUrlsSchema = z.object({
  source: z.string().min(1),
});

export const imagesRoute = new Hono<{ Variables: Variables }>()

  // ── Image rehosting ─────────────────────────────────────────────────────────

  .use("/admin/rehost-images", requireAdmin)
  .post("/admin/rehost-images", async (c) => {
    try {
      const result = await rehostImages(db);
      return c.json({ status: "ok", result });
    } catch (error) {
      log.error(error, "rehost-images failed");
      throw new AppError(500, "INTERNAL_ERROR", "Image rehosting failed");
    }
  })

  .use("/admin/regenerate-images", requireAdmin)
  .post("/admin/regenerate-images", async (c) => {
    const offset = Number(c.req.query("offset") ?? 0);
    try {
      const result = await regenerateImages(offset);
      return c.json({ status: "ok", result });
    } catch (error) {
      log.error(error, "regenerate-images failed");
      throw new AppError(500, "INTERNAL_ERROR", "Image regeneration failed");
    }
  })

  .use("/admin/clear-rehosted", requireAdmin)
  .post("/admin/clear-rehosted", async (c) => {
    try {
      const result = await clearAllRehosted(db);
      return c.json({ status: "ok", result });
    } catch (error) {
      log.error(error, "clear-rehosted failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to clear rehosted images");
    }
  })

  .use("/admin/rehost-status", requireAdmin)
  .get("/admin/rehost-status", async (c) => {
    try {
      const result = await getRehostStatus(db);
      return c.json(result);
    } catch (error) {
      log.error(error, "rehost-status failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to get rehost status");
    }
  })

  // ── Restore original URLs from a card source ──────────────────────────────

  .use("/admin/restore-image-urls", requireAdmin)
  .post("/admin/restore-image-urls", zValidator("json", restoreImageUrlsSchema), async (c) => {
    const { source } = c.req.valid("json");

    try {
      // Insert or update printing_images from printing_sources for the given source.
      // Creates missing rows (face=front, is_active=true) and backfills original_url
      // where it's currently NULL.
      const result = await sql`
          INSERT INTO printing_images (printing_id, face, source, original_url, is_active)
          SELECT ps.printing_id, 'front', cs.source, ps.image_url, true
          FROM printing_sources ps
          JOIN card_sources cs ON cs.id = ps.card_source_id
          WHERE ps.printing_id IS NOT NULL
            AND ps.image_url IS NOT NULL
            AND cs.source = ${source}
          ON CONFLICT (printing_id, face, source) DO UPDATE
            SET original_url = EXCLUDED.original_url, updated_at = now()
            WHERE printing_images.original_url IS NULL
        `.execute(db);

      const updated = Number(result.numAffectedRows ?? 0);
      return c.json({ status: "ok", result: { source, updated } });
    } catch (error) {
      log.error(error, "restore-image-urls failed");
      throw new AppError(500, "INTERNAL_ERROR", "Failed to restore image URLs");
    }
  });
