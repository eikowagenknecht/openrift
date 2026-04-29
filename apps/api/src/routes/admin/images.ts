import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  RegenerateImagesCheckpoint,
  RegenerateImagesKickoffResponse,
  RestoreImageUrlsResponse,
} from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
  REGENERATE_IMAGES_KIND,
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  isRegenerateCheckpoint,
  migrateImageDirectories,
  rehostImages,
  runRegenerateImagesJob,
  unrehostImages,
} from "../../services/image-rehost.js";
import { runJobAsync } from "../../services/run-job.js";
import type { Variables } from "../../types.js";
import { restoreImageUrlsSchema } from "./schemas.js";

const log = createLogger("admin");

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
            total: z.number().openapi({ example: 468 }),
            rehosted: z.number().openapi({ example: 452 }),
            skipped: z.number().openapi({ example: 14 }),
            failed: z.number().openapi({ example: 2 }),
            errors: z.array(z.string()).openapi({
              example: ["OGN-202/298: failed to fetch from upstream (HTTP 503)"],
            }),
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
    query: z.object({
      reset: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
      skipExisting: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            runId: z.string().uuid(),
            status: z.enum(["running", "already_running"]),
          }),
        },
      },
      description: "Regenerate images job kicked off; poll job_runs for progress.",
    },
  },
});

const cancelRegenerateImagesRoute = createRoute({
  method: "post",
  path: "/regenerate-images/cancel",
  tags: ["Admin - Images"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            runId: z.string().uuid(),
            cancelRequested: z.literal(true),
          }),
        },
      },
      description: "Cancellation requested; the running job will stop after the next batch.",
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
            scanned: z.number().openapi({ example: 1404 }),
            deleted: z.number().openapi({ example: 23 }),
            errors: z.array(z.string()).openapi({ example: [] }),
          }),
        },
      },
      description: "Cleanup orphaned files result",
    },
  },
});

const unrehostImagesRoute = createRoute({
  method: "post",
  path: "/unrehost-images",
  tags: ["Admin - Images"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            imageIds: z.array(z.string().uuid()).min(1).max(1000),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number().openapi({ example: 12 }),
            unrehosted: z.number().openapi({ example: 12 }),
            failed: z.number().openapi({ example: 0 }),
            errors: z.array(z.string()).openapi({ example: [] }),
          }),
        },
      },
      description: "Un-rehost images result",
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
          schema: z.object({ cleared: z.number().openapi({ example: 468 }) }),
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
            total: z.number().openapi({ example: 1404 }),
            rehosted: z.number().openapi({ example: 1380 }),
            external: z.number().openapi({ example: 24 }),
            orphanedFiles: z.number().openapi({ example: 12 }),
            sets: z.array(
              z.object({
                setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
                setName: z.string().openapi({ example: "Origins" }),
                total: z.number().openapi({ example: 468 }),
                rehosted: z.number().openapi({ example: 460 }),
                external: z.number().openapi({ example: 8 }),
              }),
            ),
            disk: z.object({
              totalBytes: z.number().openapi({ example: 524_288_000 }),
              byResolution: z.array(
                z.object({
                  resolution: z.string().openapi({ example: "672x936" }),
                  bytes: z.number().openapi({ example: 314_572_800 }),
                  fileCount: z.number().openapi({ example: 468 }),
                }),
              ),
              sets: z.array(
                z.object({
                  setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
                  bytes: z.number().openapi({ example: 167_772_160 }),
                  fileCount: z.number().openapi({ example: 468 }),
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
            total: z.number().openapi({ example: 3 }),
            broken: z.array(
              z.object({
                imageId: z.string().openapi({ example: "019d02f1-d14f-769f-9295-9852db692dbe" }),
                rehostedUrl: z
                  .string()
                  .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe" }),
                originalUrl: z
                  .string()
                  .nullable()
                  .openapi({ example: "https://example.com/cards/jinx-rebel.jpg" }),
                cardSlug: z.string().openapi({ example: "jinx-rebel" }),
                cardName: z.string().openapi({ example: "Jinx, Rebel" }),
                printingShortCode: z.string().openapi({ example: "OGN-202" }),
                setSlug: z.string().openapi({ example: "OGN" }),
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
            total: z.number().openapi({ example: 5 }),
            lowRes: z.array(
              z.object({
                imageId: z.string().openapi({ example: "019d02f1-d14f-769f-9295-9852db692dbe" }),
                rehostedUrl: z
                  .string()
                  .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe" }),
                originalUrl: z
                  .string()
                  .nullable()
                  .openapi({ example: "https://example.com/cards/jinx-rebel.jpg" }),
                cardSlug: z.string().openapi({ example: "jinx-rebel" }),
                cardName: z.string().openapi({ example: "Jinx, Rebel" }),
                printingShortCode: z.string().openapi({ example: "OGN-202" }),
                setSlug: z.string().openapi({ example: "OGN" }),
                width: z.number().openapi({ example: 320 }),
                height: z.number().openapi({ example: 446 }),
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
              cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
              slug: z.string().openapi({ example: "jinx-rebel" }),
              name: z.string().openapi({ example: "Jinx, Rebel" }),
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
            scanned: z.number().openapi({ example: 1404 }),
            moved: z.number().openapi({ example: 1392 }),
            skipped: z.number().openapi({ example: 12 }),
            failed: z.number().openapi({ example: 0 }),
            errors: z.array(z.string()).openapi({ example: [] }),
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
          schema: z.object({
            provider: z.string().openapi({ example: "riftcore" }),
            updated: z.number().openapi({ example: 312 }),
          }),
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
    const repos = c.get("repos");
    const io = c.get("io");
    const { reset, skipExisting } = c.req.valid("query");

    // Auto-resume from the most recent failed run with a valid checkpoint
    // that still has work left, unless ?reset=true was passed.
    let resumeFrom: { runId: string; checkpoint: RegenerateImagesCheckpoint } | undefined;
    if (!reset) {
      const prior = await repos.jobRuns.findLatestForResume(REGENERATE_IMAGES_KIND);
      if (
        prior?.status === "failed" &&
        isRegenerateCheckpoint(prior.result) &&
        prior.result.lastProcessedIndex < prior.result.totalFiles - 1
      ) {
        resumeFrom = { runId: prior.id, checkpoint: prior.result };
      }
    }

    const kickoff = await runJobAsync(
      { repos, log },
      REGENERATE_IMAGES_KIND,
      "admin",
      (runId) =>
        runRegenerateImagesJob(
          { io, printingImages: repos.printingImages, jobRuns: repos.jobRuns, log },
          runId,
          { resumeFrom, skipExisting: skipExisting ?? false },
        ),
      // Persist the final checkpoint as the run's `result` so the admin UI can
      // show counts + per-image errors after the job finishes. Without this,
      // `runJobAsync` would overwrite the per-batch `updateResult` checkpoint
      // with NULL on success. Drop the per-image `snapshot` since it's only
      // needed for mid-run resume, and would bloat the row by thousands of
      // entries.
      {
        summarize: ({ snapshot: _snapshot, ...summary }) => summary,
      },
    );

    return c.json(kickoff satisfies RegenerateImagesKickoffResponse);
  })

  .openapi(cancelRegenerateImagesRoute, async (c) => {
    const { jobRuns } = c.get("repos");
    const running = await jobRuns.findRunning(REGENERATE_IMAGES_KIND);
    if (!running) {
      throw new HTTPException(404, { message: "No regenerate-images job is running" });
    }
    const current = await jobRuns.getResult(running.id);
    if (!isRegenerateCheckpoint(current)) {
      // Job started but hasn't written its first checkpoint yet — nothing to
      // flag. The caller can retry once progress shows up.
      throw new HTTPException(409, { message: "Job is still initializing; try again shortly" });
    }
    await jobRuns.updateResult(running.id, { ...current, cancelRequested: true });
    return c.json({ runId: running.id, cancelRequested: true as const });
  })

  .openapi(cleanupOrphaned, async (c) => {
    const { printingImages } = c.get("repos");
    const result = await cleanupOrphanedFiles(c.get("io"), printingImages);
    return c.json(result);
  })

  .openapi(unrehostImagesRoute, async (c) => {
    const { printingImages } = c.get("repos");
    const { imageIds } = c.req.valid("json");
    const result = await unrehostImages(c.get("io"), printingImages, imageIds);
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
