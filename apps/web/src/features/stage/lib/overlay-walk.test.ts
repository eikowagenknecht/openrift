import { describe, expect, it } from "vitest";

import { deriveOverlayWalk } from "./overlay-walk";

describe("deriveOverlayWalk", () => {
  it("steps both ways from the live card", () => {
    const walk = deriveOverlayWalk(["a", "b", "c"], "b");

    expect(walk).toEqual({
      position: 2,
      total: 3,
      previousPrintingId: "a",
      nextPrintingId: "c",
    });
  });

  it("offers the first card when nothing is live", () => {
    const walk = deriveOverlayWalk(["a", "b"], null);

    expect(walk).toEqual({
      position: null,
      total: 2,
      previousPrintingId: null,
      nextPrintingId: "a",
    });
  });

  it("offers the first card when the live one was pushed from outside the queue", () => {
    const walk = deriveOverlayWalk(["a", "b"], "searched");

    expect(walk).toEqual({
      position: null,
      total: 2,
      previousPrintingId: null,
      nextPrintingId: "a",
    });
  });

  it("stops at the start instead of wrapping to the end", () => {
    const walk = deriveOverlayWalk(["a", "b", "c"], "a");

    expect(walk.position).toBe(1);
    expect(walk.previousPrintingId).toBeNull();
    expect(walk.nextPrintingId).toBe("b");
  });

  it("stops at the end instead of wrapping to the start", () => {
    const walk = deriveOverlayWalk(["a", "b", "c"], "c");

    expect(walk.position).toBe(3);
    expect(walk.previousPrintingId).toBe("b");
    expect(walk.nextPrintingId).toBeNull();
  });

  it("anchors on the first occurrence of a repeated card", () => {
    const walk = deriveOverlayWalk(["a", "b", "a", "c"], "a");

    expect(walk.position).toBe(1);
    expect(walk.previousPrintingId).toBeNull();
    expect(walk.nextPrintingId).toBe("b");
  });

  it("has nowhere to go with an empty queue", () => {
    expect(deriveOverlayWalk([], null)).toEqual({
      position: null,
      total: 0,
      previousPrintingId: null,
      nextPrintingId: null,
    });
    expect(deriveOverlayWalk([], "a")).toEqual({
      position: null,
      total: 0,
      previousPrintingId: null,
      nextPrintingId: null,
    });
  });

  it("walks a single-card queue without offering a step either way", () => {
    const walk = deriveOverlayWalk(["a"], "a");

    expect(walk).toEqual({
      position: 1,
      total: 1,
      previousPrintingId: null,
      nextPrintingId: null,
    });
  });
});
