import { z } from "zod";

// Shapes the API writes into `job_runs.result` (typed `z.any()` on the wire,
// since that column is polymorphic per job kind — see contracts/admin/job-runs).
// These schemas are the single source for both the shared response types and the
// web's read-side guards (`schema.safeParse(run.result)`), so the type and the
// runtime check can no longer drift.

export const regenerateImagesCheckpointSchema = z.object({
  snapshot: z.array(z.object({ imageId: z.string(), rehostedUrl: z.string() })),
  totalFiles: z.number(),
  /** -1 means nothing processed yet; resume starts at this index + 1. */
  lastProcessedIndex: z.number(),
  /** Sum across resumes (regenerated + failed). */
  processed: z.number(),
  regenerated: z.number(),
  failed: z.number(),
  /** Bounded list of error strings; older entries are dropped past the cap. */
  errors: z.array(z.string()),
  resumedFromRunId: z.string().nullable(),
  cancelRequested: z.boolean(),
  skipExisting: z.boolean(),
});

/**
 * Reads `job_runs.result` (typed `unknown`) as a regenerate checkpoint. Both the
 * API's resume path and the admin page's progress panel go through this, so a
 * field added above tightens the check on both sides at once.
 * @param value The raw `job_runs.result` payload.
 * @returns True when the value matches the checkpoint schema.
 */
export function isRegenerateImagesCheckpoint(
  value: unknown,
): value is z.infer<typeof regenerateImagesCheckpointSchema> {
  return regenerateImagesCheckpointSchema.safeParse(value).success;
}

export const priceRefreshUpsertCountsSchema = z.object({
  total: z.number(),
  new: z.number(),
  updated: z.number(),
  unchanged: z.number(),
});

export const priceRefreshResponseSchema = z.object({
  transformed: z.object({
    groups: z.number(),
    products: z.number(),
    prices: z.number(),
  }),
  upserted: z.object({
    prices: priceRefreshUpsertCountsSchema,
  }),
});
