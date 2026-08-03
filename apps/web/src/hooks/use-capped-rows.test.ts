import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CAPPED_ROWS_LIMIT, useCappedRows } from "./use-capped-rows";

/** @returns A list of `count` placeholder rows, numbered from 0. */
function rows(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

describe("useCappedRows", () => {
  it("leaves an empty list alone", () => {
    const { result } = renderHook(() => useCappedRows<number>([], 3));

    expect(result.current.rows).toEqual([]);
    expect(result.current.hiddenCount).toBe(0);
    expect(result.current.foldable).toBe(false);
  });

  it("leaves a list at the limit alone", () => {
    const { result } = renderHook(() => useCappedRows(rows(3), 3));

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.foldable).toBe(false);
  });

  it("does not fold a single overflowing row", () => {
    const { result } = renderHook(() => useCappedRows(rows(4), 3));

    expect(result.current.rows).toHaveLength(4);
    expect(result.current.hiddenCount).toBe(0);
    expect(result.current.foldable).toBe(false);
  });

  it("folds from two overflowing rows up", () => {
    const { result } = renderHook(() => useCappedRows(rows(5), 3));

    expect(result.current.rows).toEqual([0, 1, 2]);
    expect(result.current.hiddenCount).toBe(2);
    expect(result.current.foldable).toBe(true);
    expect(result.current.expanded).toBe(false);
  });

  it("reveals every row once toggled, and folds back", () => {
    const { result } = renderHook(() => useCappedRows(rows(10), 3));

    act(() => result.current.toggle());

    expect(result.current.rows).toHaveLength(10);
    expect(result.current.hiddenCount).toBe(0);
    expect(result.current.expanded).toBe(true);
    expect(result.current.foldable).toBe(true);

    act(() => result.current.toggle());

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.hiddenCount).toBe(7);
  });

  it("shows every row when the list shrinks below the fold while expanded", () => {
    const { rerender, result } = renderHook(({ items }) => useCappedRows(items, 3), {
      initialProps: { items: rows(10) },
    });

    act(() => result.current.toggle());
    rerender({ items: rows(2) });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.foldable).toBe(false);
    expect(result.current.hiddenCount).toBe(0);
  });

  it("defaults to the shared row limit", () => {
    const { result } = renderHook(() => useCappedRows(rows(CAPPED_ROWS_LIMIT + 2)));

    expect(result.current.rows).toHaveLength(CAPPED_ROWS_LIMIT);
    expect(result.current.hiddenCount).toBe(2);
  });
});
