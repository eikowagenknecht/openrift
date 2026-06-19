import { describe, expect, it } from "vitest";

import { getPageItems } from "./paginate";

describe("getPageItems", () => {
  it("returns a single page when there is one or fewer pages", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(1, 0)).toEqual([1]);
    expect(getPageItems(3, -2)).toEqual([1]);
  });

  it("lists every page without ellipsis when the total is small", () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("adds a trailing ellipsis when near the start of a long range", () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, "ellipsis", 20]);
    expect(getPageItems(2, 20)).toEqual([1, 2, 3, "ellipsis", 20]);
  });

  it("adds a leading ellipsis when near the end of a long range", () => {
    expect(getPageItems(20, 20)).toEqual([1, "ellipsis", 19, 20]);
    expect(getPageItems(19, 20)).toEqual([1, "ellipsis", 18, 19, 20]);
  });

  it("brackets the current page with ellipsis on both sides in the middle", () => {
    expect(getPageItems(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });

  it("widens the window with a larger sibling count", () => {
    expect(getPageItems(10, 20, 2)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 20]);
  });

  it("clamps an out-of-range current page into the valid window", () => {
    expect(getPageItems(99, 20)).toEqual([1, "ellipsis", 19, 20]);
    expect(getPageItems(0, 20)).toEqual([1, 2, "ellipsis", 20]);
  });

  it("never repeats the first or last page next to the window", () => {
    // current=3 in a long range would put a sibling at page 2, adjacent to
    // page 1, so no leading ellipsis is inserted.
    expect(getPageItems(3, 20)).toEqual([1, 2, 3, 4, "ellipsis", 20]);
  });
});
