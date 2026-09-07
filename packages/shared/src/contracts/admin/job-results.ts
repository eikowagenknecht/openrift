import { z } from "zod";

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
