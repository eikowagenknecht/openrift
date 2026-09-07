import { describe, expect, it } from "vitest";

import {
  chunkProductCopies,
  expandProductContents,
  PRODUCT_COPY_BATCH_SIZE,
  productCopyTotal,
} from "./product-copies";

const CONTENTS = [
  { printingId: "print-a", quantity: 2 },
  { printingId: "print-b", quantity: 1 },
];

describe("productCopyTotal", () => {
  it("sums quantities for a single product", () => {
    expect(productCopyTotal(CONTENTS, 1)).toBe(3);
  });

  it("multiplies by the product count", () => {
    expect(productCopyTotal(CONTENTS, 3)).toBe(9);
  });

  it("returns 0 for empty contents", () => {
    expect(productCopyTotal([], 5)).toBe(0);
  });

  it("clamps non-positive and fractional counts", () => {
    expect(productCopyTotal(CONTENTS, 0)).toBe(0);
    expect(productCopyTotal(CONTENTS, -2)).toBe(0);
    expect(productCopyTotal(CONTENTS, 2.9)).toBe(6);
  });
});

describe("expandProductContents", () => {
  it("expands quantities into one row per physical card", () => {
    expect(expandProductContents(CONTENTS, "col-1", 1)).toEqual([
      { printingId: "print-a", collectionId: "col-1" },
      { printingId: "print-a", collectionId: "col-1" },
      { printingId: "print-b", collectionId: "col-1" },
    ]);
  });

  it("repeats the full manifest for each product copy", () => {
    const rows = expandProductContents(CONTENTS, "col-1", 2);
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.printingId === "print-a")).toHaveLength(4);
    expect(rows.filter((row) => row.printingId === "print-b")).toHaveLength(2);
  });

  it("returns no rows for empty contents or a zero count", () => {
    expect(expandProductContents([], "col-1", 2)).toEqual([]);
    expect(expandProductContents(CONTENTS, "col-1", 0)).toEqual([]);
  });

  it("stays consistent with productCopyTotal", () => {
    for (const count of [0, 1, 2, 7]) {
      expect(expandProductContents(CONTENTS, "col-1", count)).toHaveLength(
        productCopyTotal(CONTENTS, count),
      );
    }
  });
});

describe("chunkProductCopies", () => {
  it("returns no batches for no rows", () => {
    expect(chunkProductCopies([])).toEqual([]);
  });

  it("keeps small payloads in a single batch", () => {
    const rows = expandProductContents(CONTENTS, "col-1", 1);
    expect(chunkProductCopies(rows)).toEqual([rows]);
  });

  it("splits at the API batch limit and preserves order", () => {
    const rows = Array.from({ length: PRODUCT_COPY_BATCH_SIZE + 2 }, (_, index) => ({
      printingId: `print-${index}`,
      collectionId: "col-1",
    }));
    const batches = chunkProductCopies(rows);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(PRODUCT_COPY_BATCH_SIZE);
    expect(batches[1]).toHaveLength(2);
    expect(batches.flat()).toEqual(rows);
  });
});
