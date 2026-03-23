import { zValidator } from "@hono/zod-validator";
import type { RestoreImageUrlsResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

import {
  cleanupOrphanedFiles,
  clearAllRehosted,
  collectStaleImages,
  findBrokenImages,
  getRehostStatus,
  regenerateImages,
  rehostImages,
  renameStaleImages,
} from "../../services/image-rehost.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const restoreImageUrlsSchema = z.object({
  provider: z.string().min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const imagesRoute = new Hono<{ Variables: Variables }>()

  // ── Image rehosting ─────────────────────────────────────────────────────────

  .post(
    "/rehost-images",
    zValidator("query", z.object({ limit: z.coerce.number().int().min(1).optional() })),
    async (c) => {
      const { printingImages } = c.get("repos");
      const limit = c.req.valid("query").limit ?? 10;
      const result = await rehostImages(c.get("io"), printingImages, limit);
      return c.json(result);
    },
  )

  .post(
    "/regenerate-images",
    zValidator("query", z.object({ offset: z.coerce.number().int().min(0).optional() })),
    async (c) => {
      const offset = c.req.valid("query").offset ?? 0;
      const result = await regenerateImages(c.get("io"), offset);
      return c.json(result);
    },
  )

  .get("/rename-preview", async (c) => {
    const { printingImages } = c.get("repos");
    const { total, stale } = await collectStaleImages(printingImages);
    return c.json({ total, misnamed: stale.length });
  })

  .post("/rename-images", async (c) => {
    const { printingImages } = c.get("repos");
    const result = await renameStaleImages(c.get("io"), printingImages);
    return c.json(result);
  })

  .post("/cleanup-orphaned", async (c) => {
    const { printingImages } = c.get("repos");
    const result = await cleanupOrphanedFiles(c.get("io"), printingImages);
    return c.json(result);
  })

  .post("/clear-rehosted", async (c) => {
    const { printingImages } = c.get("repos");
    const result = await clearAllRehosted(c.get("io"), printingImages);
    return c.json(result);
  })

  .get("/rehost-status", async (c) => {
    const { printingImages } = c.get("repos");
    const result = await getRehostStatus(c.get("io"), printingImages);
    return c.json(result);
  })

  // ── Restore original URLs from a card source ──────────────────────────────

  .get("/broken-images", async (c) => {
    const { printingImages } = c.get("repos");
    const result = await findBrokenImages(c.get("io"), printingImages);
    return c.json(result);
  })

  .get("/missing-images", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.listCardsWithMissingImages());
  })

  .post("/restore-image-urls", zValidator("json", restoreImageUrlsSchema), async (c) => {
    const { printingImages } = c.get("repos");
    const { provider } = c.req.valid("json");
    const updated = await printingImages.restoreFromSources(provider);
    return c.json({ provider, updated } satisfies RestoreImageUrlsResponse);
  });
