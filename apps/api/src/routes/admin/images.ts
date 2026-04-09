import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { RestoreImageUrlsResponse } from "@openrift/shared";
import { z } from "zod";

import {
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  migrateImageDirectories,
  regenerateImages,
  rehostImages,
} from "../../services/image-rehost.js";
import type { Variables } from "../../types.js";
import { restoreImageUrlsSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const rehostImagesRoute = createRoute({
  method: "post",
  path: "/rehost-images",
  tags: ["Admin - Images"],
  request: {
    query: z.object({ limit: z.coerce.number().int().min(1).optional() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number(),
            rehosted: z.number(),
            skipped: z.number(),
            failed: z.number(),
            errors: z.array(z.string()),
          }),
        },
      },
      description: "Rehost images result",
    },
  },
});

const regenerateImagesRoute = createRoute({
  method: "post",
  path: "/regenerate-images",
  tags: ["Admin - Images"],
  request: {
    query: z.object({ offset: z.coerce.number().int().min(0).optional() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number(),
            regenerated: z.number(),
            failed: z.number(),
            errors: z.array(z.string()),
            hasMore: z.boolean(),
            totalFiles: z.number(),
          }),
        },
      },
      description: "Regenerate images result",
    },
  },
});

const cleanupOrphaned = createRoute({
  method: "post",
  path: "/cleanup-orphaned",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            scanned: z.number(),
            deleted: z.number(),
            errors: z.array(z.string()),
          }),
        },
      },
      description: "Cleanup orphaned files result",
    },
  },
});

const clearRehosted = createRoute({
  method: "post",
  path: "/clear-rehosted",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ cleared: z.number() }),
        },
      },
      description: "Clear rehosted result",
    },
  },
});

const rehostStatus = createRoute({
  method: "get",
  path: "/rehost-status",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number(),
            rehosted: z.number(),
            external: z.number(),
            orphanedFiles: z.number(),
            sets: z.array(
              z.object({
                setId: z.string(),
                setName: z.string(),
                total: z.number(),
                rehosted: z.number(),
                external: z.number(),
              }),
            ),
            disk: z.object({
              totalBytes: z.number(),
              byResolution: z.array(
                z.object({
                  resolution: z.string(),
                  bytes: z.number(),
                  fileCount: z.number(),
                }),
              ),
              sets: z.array(
                z.object({
                  setId: z.string(),
                  bytes: z.number(),
                  fileCount: z.number(),
                }),
              ),
            }),
          }),
        },
      },
      description: "Rehost status",
    },
  },
});

const brokenImages = createRoute({
  method: "get",
  path: "/broken-images",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number(),
            broken: z.array(
              z.object({
                imageId: z.string(),
                rehostedUrl: z.string(),
                originalUrl: z.string().nullable(),
                cardSlug: z.string(),
                cardName: z.string(),
                printingShortCode: z.string(),
                setSlug: z.string(),
              }),
            ),
          }),
        },
      },
      description: "Broken images",
    },
  },
});

const lowResImages = createRoute({
  method: "get",
  path: "/low-res-images",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number(),
            lowRes: z.array(
              z.object({
                imageId: z.string(),
                rehostedUrl: z.string(),
                originalUrl: z.string().nullable(),
                cardSlug: z.string(),
                cardName: z.string(),
                printingShortCode: z.string(),
                setSlug: z.string(),
                width: z.number(),
                height: z.number(),
              }),
            ),
          }),
        },
      },
      description: "Low resolution images",
    },
  },
});

const missingImages = createRoute({
  method: "get",
  path: "/missing-images",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              cardId: z.string(),
              slug: z.string(),
              name: z.string(),
            }),
          ),
        },
      },
      description: "Cards with missing images",
    },
  },
});

const migrateDirectories = createRoute({
  method: "post",
  path: "/migrate-directories",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            scanned: z.number(),
            moved: z.number(),
            skipped: z.number(),
            failed: z.number(),
            errors: z.array(z.string()),
          }),
        },
      },
      description: "Migrate image files from old set-slug directories to UUID-prefix directories",
    },
  },
});

const restoreImageUrls = createRoute({
  method: "post",
  path: "/restore-image-urls",
  tags: ["Admin - Images"],
  request: {
    body: { content: { "application/json": { schema: restoreImageUrlsSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ provider: z.string(), updated: z.number() }),
        },
      },
      description: "Restore image URLs result",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const imagesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── Image rehosting ─────────────────────────────────────────────────────────

  .openapi(rehostImagesRoute, async (c) => {
    const { printingImages } = c.get("repos");
    const limit = c.req.valid("query").limit ?? 10;
    const result = await rehostImages(c.get("io"), printingImages, limit);
    return c.json(result);
  })

  .openapi(regenerateImagesRoute, async (c) => {
    const offset = c.req.valid("query").offset ?? 0;
    const result = await regenerateImages(c.get("io"), offset);
    return c.json(result);
  })

  .openapi(cleanupOrphaned, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await cleanupOrphanedFiles(c.get("io"), printingImages);
    return c.json(result);
  })

  .openapi(clearRehosted, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await clearAllRehosted(c.get("io"), printingImages);
    return c.json(result);
  })

  .openapi(rehostStatus, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await getRehostStatus(c.get("io"), printingImages);
    return c.json(result);
  })

  // ── Restore original URLs from a card source ──────────────────────────────

  .openapi(brokenImages, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await findBrokenImages(c.get("io"), printingImages);
    return c.json(result);
  })

  .openapi(lowResImages, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await findLowResImages(c.get("io"), printingImages);
    return c.json(result);
  })

  .openapi(missingImages, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.listCardsWithMissingImages());
  })

  .openapi(migrateDirectories, async (c) => {
    const result = await migrateImageDirectories(c.get("io"));
    return c.json(result);
  })

  .openapi(restoreImageUrls, async (c) => {
    const { printingImages } = c.get("repos");
    const { provider } = c.req.valid("json");
    const updated = await printingImages.restoreFromSources(provider);
    return c.json({ provider, updated } satisfies RestoreImageUrlsResponse);
  });
