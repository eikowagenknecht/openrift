import { describe, expect, it } from "vitest";

import {
  isRegenerateImagesCheckpoint,
  priceRefreshResponseSchema,
  regenerateImagesCheckpointSchema,
} from "./job-results.js";

describe("regenerateImagesCheckpointSchema", () => {
  const valid = {
    snapshot: [{ imageId: "i1", rehostedUrl: "u1" }],
    totalFiles: 1,
    lastProcessedIndex: 0,
    processed: 1,
    regenerated: 1,
    failed: 0,
    errors: [],
    resumedFromRunId: null,
    cancelRequested: false,
    skipExisting: true,
  };

  it("accepts a full checkpoint", () => {
    expect(regenerateImagesCheckpointSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a checkpoint missing a counter field", () => {
    const { processed: _processed, ...partial } = valid;
    expect(regenerateImagesCheckpointSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects null and primitives", () => {
    expect(regenerateImagesCheckpointSchema.safeParse(null).success).toBe(false);
    expect(regenerateImagesCheckpointSchema.safeParse("done").success).toBe(false);
  });

  it("narrows a job_runs.result payload through the guard", () => {
    expect(isRegenerateImagesCheckpoint(valid)).toBe(true);
    expect(isRegenerateImagesCheckpoint(null)).toBe(false);
    expect(isRegenerateImagesCheckpoint({})).toBe(false);
    expect(isRegenerateImagesCheckpoint({ ...valid, snapshot: "not-an-array" })).toBe(false);
    expect(isRegenerateImagesCheckpoint({ ...valid, cancelRequested: "no" })).toBe(false);
    expect(isRegenerateImagesCheckpoint({ ...valid, resumedFromRunId: 7 })).toBe(false);
  });
});

describe("priceRefreshResponseSchema", () => {
  it("accepts the current per-SKU shape", () => {
    const value = {
      transformed: { groups: 8, products: 1165, prices: 1169 },
      upserted: { prices: { total: 1169, new: 1168, updated: 0, unchanged: 1 } },
    };
    expect(priceRefreshResponseSchema.safeParse(value).success).toBe(true);
  });

  it("rejects the pre-refactor snapshots/staging shape", () => {
    const value = {
      transformed: { groups: 8, products: 1165, prices: 1169 },
      upserted: { snapshots: {}, staging: {} },
    };
    expect(priceRefreshResponseSchema.safeParse(value).success).toBe(false);
  });
});
