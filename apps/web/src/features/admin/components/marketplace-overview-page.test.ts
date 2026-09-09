import { describe, expect, it } from "vitest";

import {
  backfillSucceededText,
  driftText,
  isPriceRefreshResult,
} from "./marketplace-overview-page";

describe("isPriceRefreshResult", () => {
  it("accepts the current per-SKU shape", () => {
    const value = {
      transformed: { groups: 8, products: 1165, prices: 1169 },
      upserted: {
        prices: { total: 1169, new: 1168, updated: 0, unchanged: 1 },
      },
    };
    expect(isPriceRefreshResult(value)).toBe(true);
  });

  it("rejects pre-refactor results that have snapshots/staging instead of prices", () => {
    const value = {
      transformed: { groups: 8, products: 1165, prices: 1169 },
      upserted: {
        snapshots: { total: 1120, new: 1119, updated: 0, unchanged: 1 },
        staging: { total: 1169, new: 1168, updated: 0, unchanged: 1 },
      },
    };
    expect(isPriceRefreshResult(value)).toBe(false);
  });

  it("rejects null and primitives", () => {
    expect(isPriceRefreshResult(null)).toBe(false);
    expect(isPriceRefreshResult(undefined)).toBe(false);
    expect(isPriceRefreshResult("done")).toBe(false);
    expect(isPriceRefreshResult(42)).toBe(false);
  });

  it("rejects objects missing transformed or upserted", () => {
    expect(isPriceRefreshResult({ upserted: { prices: { new: 0, updated: 0 } } })).toBe(false);
    expect(isPriceRefreshResult({ transformed: {} })).toBe(false);
  });

  it("rejects when prices counts have non-numeric fields", () => {
    const value = {
      transformed: {},
      upserted: { prices: { new: "1", updated: 0 } },
    };
    expect(isPriceRefreshResult(value)).toBe(false);
  });
});

describe("driftText", () => {
  it("reports the gap, the clean state, and the pending read", () => {
    expect(driftText(4941, false)).toContain("4941");
    expect(driftText(0, false)).toBe("Every printing in a mapped family has its own price link.");
    expect(driftText(undefined, false)).toContain("Checking");
  });

  it("reports a failed read instead of a count", () => {
    expect(driftText(undefined, true)).toContain("Could not read");
    expect(driftText(12, true)).toContain("Could not read");
  });
});

describe("backfillSucceededText", () => {
  it("names the number of rows added", () => {
    expect(backfillSucceededText({ inserted: 4941 })).toBe("Added 4941 sibling variants");
  });

  it("says nothing was missing when the run was a no-op", () => {
    expect(backfillSucceededText({ inserted: 0 })).toBe("Nothing to add");
  });

  it("falls back for runs recorded without a count", () => {
    expect(backfillSucceededText(null)).toBe("Completed");
    expect(backfillSucceededText({ inserted: "4941" })).toBe("Completed");
  });
});
