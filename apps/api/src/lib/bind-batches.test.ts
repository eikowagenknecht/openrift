import { describe, expect, it } from "vitest";

import { keyBatches, MAX_BIND_PARAMETERS, rowBatches } from "./bind-batches.js";

describe("rowBatches", () => {
  it("keeps every batch under what one statement can bind", () => {
    const rows = Array.from({ length: 20_000 }, (_entry, index) => ({
      a: index,
      b: index,
      c: index,
      d: index,
      e: index,
    }));

    const batches = rowBatches(rows);

    expect(batches.flat()).toEqual(rows);
    for (const batch of batches) {
      expect(batch.length * 5).toBeLessThan(MAX_BIND_PARAMETERS);
    }
  });

  it("sizes the batch from the columns the rows bind", () => {
    const narrow = rowBatches(Array.from({ length: 100_000 }, (_entry, index) => ({ a: index })));
    const wide = rowBatches(
      Array.from({ length: 100_000 }, (_entry, index) =>
        Object.fromEntries(
          Array.from({ length: 20 }, (_column, position) => [`c${position}`, index]),
        ),
      ),
    );

    expect(narrow[0]!.length).toBeGreaterThan(wide[0]!.length);
    expect(wide[0]!.length * 20).toBeLessThan(MAX_BIND_PARAMETERS);
  });

  it("counts a column the rows only sometimes carry", () => {
    const rows = Array.from({ length: 30_000 }, (_entry, index) =>
      index === 0 ? { a: index, rare: index } : { a: index },
    );

    const batches = rowBatches(rows);

    expect(batches[0]!.length * 2).toBeLessThan(MAX_BIND_PARAMETERS);
  });

  it("ignores a key that is undefined in every row, which kysely never names", () => {
    const bound = rowBatches(Array.from({ length: 10 }, () => ({ a: 1, b: 2 })));
    const withUndefined = rowBatches(
      Array.from({ length: 10 }, () => ({ a: 1, b: 2, c: undefined })),
    );

    expect(withUndefined[0]!.length).toBe(bound[0]!.length);
  });

  it("yields no batches for an empty list", () => {
    expect(rowBatches([])).toEqual([]);
  });

  it("keeps rows that bind nothing in one batch", () => {
    expect(rowBatches([{}, {}])).toEqual([[{}, {}]]);
  });

  it("never yields an empty batch for a row wider than the budget", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 80_000 }, (_entry, index) => [`c${index}`, index]),
    );

    expect(rowBatches([wide])).toEqual([[wide]]);
  });
});

describe("keyBatches", () => {
  it("splits a list too long for one statement to bind", () => {
    const keys = Array.from({ length: 70_000 }, (_entry, index) => index);

    const batches = keyBatches(keys);

    expect(batches.flat()).toEqual(keys);
    for (const batch of batches) {
      expect(batch.length).toBeLessThan(MAX_BIND_PARAMETERS);
    }
  });

  it("yields no batches for an empty list", () => {
    expect(keyBatches([])).toEqual([]);
  });
});
