import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { jobStartedResponseSchema } from "./shared.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Images";

const BASE = "/api/admin/v1";

// ── Shared result shapes ──────────────────────────────────────────────────

export const rehostResultSchema = z.object({
  total: z.number(),
  rehosted: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

export const cleanupResultSchema = z.object({
  scanned: z.number(),
  deleted: z.number(),
  errors: z.array(z.string()),
});

export const unrehostResultSchema = z.object({
  total: z.number(),
  unrehosted: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

export const rehostStatusSchema = z.object({
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
      z.object({ resolution: z.string(), bytes: z.number(), fileCount: z.number() }),
    ),
    sets: z.array(z.object({ setId: z.string(), bytes: z.number(), fileCount: z.number() })),
  }),
});

export const brokenImageSchema = z.object({
  imageId: z.string(),
  rehostedUrl: z.string(),
  originalUrl: z.string().nullable(),
  cardSlug: z.string(),
  cardName: z.string(),
  printingShortCode: z.string(),
  setSlug: z.string(),
});

export const clearRehostedResponseSchema = z
  .object({ cleared: z.number() })
  .openapi("ClearRehostedResponse");

export const brokenImagesResponseSchema = z
  .object({ total: z.number(), broken: z.array(brokenImageSchema) })
  .openapi("BrokenImagesResponse");

export const lowResImageEntrySchema = brokenImageSchema
  .extend({ width: z.number(), height: z.number() })
  .openapi("LowResImageEntry");

export const lowResImagesResponseSchema = z
  .object({ total: z.number(), lowRes: z.array(lowResImageEntrySchema) })
  .openapi("LowResImagesResponse");

export const unrehostImagesInputSchema = z
  .object({ imageIds: z.array(z.uuid()).min(1).max(1000) })
  .openapi("UnrehostImagesRequest");

export const missingImageCardSchema = z
  .object({
    cardId: z.string(),
    slug: z.string(),
    name: z.string(),
    /** Printings without an active front image, counted per language code. */
    byLanguage: z.array(z.object({ language: z.string(), count: z.number() })),
  })
  .openapi("MissingImageCard");

const migrateResultSchema = z.object({
  scanned: z.number(),
  moved: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

/**
 * oRPC contract for the admin image tooling (mounted under `/api/admin/v1`,
 * admin-gated by the mount). All procedures share the `authedRoute` base
 * (UNAUTHORIZED + FORBIDDEN). Covers rehosting, the resumable regenerate job +
 * cancel, cleanup/migration utilities, and read-only health reports (status,
 * broken, low-res, missing). `rehost-images` / `regenerate-images` carry query
 * params, so they use detailed input structure. Domain codes per route:
 * `cancelRegenerate` → NOT_FOUND (no job running) + CONFLICT (job still
 * initializing).
 */
export const adminImagesContract = {
  rehost: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/rehost-images`,
      tags: [TAG],
      inputStructure: "detailed",
    })
    .input(z.object({ query: z.object({ limit: z.coerce.number().int().min(1).optional() }) }))
    .output(rehostResultSchema),
  regenerate: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/regenerate-images`,
      tags: [TAG],
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          reset: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
          skipExisting: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
          scansOnly: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
        }),
      }),
    )
    .output(jobStartedResponseSchema),
  cancelRegenerate: authedRoute
    .route({ method: "POST", path: `${BASE}/regenerate-images/cancel`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "No regenerate-images job is currently running" },
      CONFLICT: { message: "Job is still initializing; try again shortly" },
    })
    .output(z.object({ runId: z.uuid(), cancelRequested: z.literal(true) })),
  cleanupOrphaned: authedRoute
    .route({ method: "POST", path: `${BASE}/cleanup-orphaned`, tags: [TAG] })
    .output(cleanupResultSchema),
  unrehost: authedRoute
    .route({ method: "POST", path: `${BASE}/unrehost-images`, tags: [TAG] })
    .input(unrehostImagesInputSchema)
    .output(unrehostResultSchema),
  clearRehosted: authedRoute
    .route({ method: "POST", path: `${BASE}/clear-rehosted`, tags: [TAG] })
    .output(clearRehostedResponseSchema),
  rehostStatus: authedRoute
    .route({ method: "GET", path: `${BASE}/rehost-status`, tags: [TAG] })
    .output(rehostStatusSchema),
  brokenImages: authedRoute
    .route({ method: "GET", path: `${BASE}/broken-images`, tags: [TAG] })
    .output(brokenImagesResponseSchema),
  lowResImages: authedRoute
    .route({ method: "GET", path: `${BASE}/low-res-images`, tags: [TAG] })
    .output(lowResImagesResponseSchema),
  missingImages: authedRoute
    .route({ method: "GET", path: `${BASE}/missing-images`, tags: [TAG] })
    .output(z.array(missingImageCardSchema)),
  migrateDirectories: authedRoute
    .route({ method: "POST", path: `${BASE}/migrate-directories`, tags: [TAG] })
    .output(migrateResultSchema),
};

export type AdminImagesContract = typeof adminImagesContract;
