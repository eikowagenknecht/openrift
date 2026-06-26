import { oc } from "@orpc/contract";
import { z } from "zod";

import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Images";

const BASE = "/api/admin/v1";

// ── Shared result shapes ──────────────────────────────────────────────────

const rehostResultSchema = z.object({
  total: z.number(),
  rehosted: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

const cleanupResultSchema = z.object({
  scanned: z.number(),
  deleted: z.number(),
  errors: z.array(z.string()),
});

const unrehostResultSchema = z.object({
  total: z.number(),
  unrehosted: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

const rehostStatusSchema = z.object({
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

const brokenImageSchema = z.object({
  imageId: z.string(),
  rehostedUrl: z.string(),
  originalUrl: z.string().nullable(),
  cardSlug: z.string(),
  cardName: z.string(),
  printingShortCode: z.string(),
  setSlug: z.string(),
});

const migrateResultSchema = z.object({
  scanned: z.number(),
  moved: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

/**
 * oRPC contract for the admin image tooling (mounted under `/api/admin/v1`,
 * admin-gated by the mount): rehosting, the resumable regenerate job + cancel,
 * cleanup/migration utilities, and read-only health reports (status, broken,
 * low-res, missing). `rehost-images` / `regenerate-images` carry query params,
 * so they use detailed input structure (oRPC compact mode does not read POST
 * query params). Not-found / conflict states are thrown as `AppError` and
 * bridged to ORPCErrors in the implementation.
 */
export const adminImagesContract = {
  rehost: oc
    .route({
      method: "POST",
      path: `${BASE}/rehost-images`,
      tags: [TAG],
      inputStructure: "detailed",
    })
    .input(z.object({ query: z.object({ limit: z.coerce.number().int().min(1).optional() }) }))
    .output(rehostResultSchema),
  regenerate: oc
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
        }),
      }),
    )
    .output(jobStartedResponseSchema),
  cancelRegenerate: oc
    .route({ method: "POST", path: `${BASE}/regenerate-images/cancel`, tags: [TAG] })
    .output(z.object({ runId: z.string().uuid(), cancelRequested: z.literal(true) })),
  cleanupOrphaned: oc
    .route({ method: "POST", path: `${BASE}/cleanup-orphaned`, tags: [TAG] })
    .output(cleanupResultSchema),
  unrehost: oc
    .route({ method: "POST", path: `${BASE}/unrehost-images`, tags: [TAG] })
    .input(z.object({ imageIds: z.array(z.string().uuid()).min(1).max(1000) }))
    .output(unrehostResultSchema),
  clearRehosted: oc
    .route({ method: "POST", path: `${BASE}/clear-rehosted`, tags: [TAG] })
    .output(z.object({ cleared: z.number() })),
  rehostStatus: oc
    .route({ method: "GET", path: `${BASE}/rehost-status`, tags: [TAG] })
    .output(rehostStatusSchema),
  brokenImages: oc
    .route({ method: "GET", path: `${BASE}/broken-images`, tags: [TAG] })
    .output(z.object({ total: z.number(), broken: z.array(brokenImageSchema) })),
  lowResImages: oc.route({ method: "GET", path: `${BASE}/low-res-images`, tags: [TAG] }).output(
    z.object({
      total: z.number(),
      lowRes: z.array(brokenImageSchema.extend({ width: z.number(), height: z.number() })),
    }),
  ),
  missingImages: oc
    .route({ method: "GET", path: `${BASE}/missing-images`, tags: [TAG] })
    .output(z.array(z.object({ cardId: z.string(), slug: z.string(), name: z.string() }))),
  migrateDirectories: oc
    .route({ method: "POST", path: `${BASE}/migrate-directories`, tags: [TAG] })
    .output(migrateResultSchema),
};

export type AdminImagesContract = typeof adminImagesContract;
