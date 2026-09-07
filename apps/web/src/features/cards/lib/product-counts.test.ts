import { describe, expect, it } from "vitest";

import { formatProductCounts } from "./product-counts";

describe("formatProductCounts", () => {
  it("collapses to a single count when totals match", () => {
    expect(formatProductCounts(60, 60)).toBe("60 cards");
  });

  it("shows both counts when they differ", () => {
    expect(formatProductCounts(120, 60)).toBe("120 cards · 60 unique");
  });

  it("uses the singular for a single card", () => {
    expect(formatProductCounts(1, 1)).toBe("1 card");
  });

  it("handles zero counts", () => {
    expect(formatProductCounts(0, 0)).toBe("0 cards");
  });
});
