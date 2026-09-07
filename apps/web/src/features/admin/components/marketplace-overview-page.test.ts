import { describe, expect, it } from "vitest";

import { isPriceRefreshResult } from "./marketplace-overview-page";

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
