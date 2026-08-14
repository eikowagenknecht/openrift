import { describe, expect, it } from "vitest";

import { coverOverflowPx, coverPositionFromDrag } from "@/lib/cover-focus";

describe("coverOverflowPx", () => {
  it("returns the cropped height for portrait art in a wide box", () => {
    // 480x672 art scaled to 240 wide is 336 tall; 96 of that is visible.
    expect(
      coverOverflowPx({ boxWidth: 240, boxHeight: 96, naturalWidth: 480, naturalHeight: 672 }),
    ).toBe(240);
  });

  it("returns 0 when the art fills the box exactly", () => {
    expect(
      coverOverflowPx({ boxWidth: 200, boxHeight: 100, naturalWidth: 400, naturalHeight: 200 }),
    ).toBe(0);
  });

  it("returns 0 when the art is wider than the box, so only width is cropped", () => {
    expect(
      coverOverflowPx({ boxWidth: 100, boxHeight: 100, naturalWidth: 400, naturalHeight: 200 }),
    ).toBe(0);
  });

  it("returns 0 while the image is unmeasured", () => {
    expect(
      coverOverflowPx({ boxWidth: 240, boxHeight: 96, naturalWidth: 0, naturalHeight: 0 }),
    ).toBe(0);
    expect(
      coverOverflowPx({ boxWidth: 0, boxHeight: 0, naturalWidth: 480, naturalHeight: 672 }),
    ).toBe(0);
  });
});

describe("coverPositionFromDrag", () => {
  it("moves the focus up when dragging down", () => {
    expect(coverPositionFromDrag(50, 60, 240)).toBe(25);
  });

  it("moves the focus down when dragging up", () => {
    expect(coverPositionFromDrag(50, -60, 240)).toBe(75);
  });

  it("keeps the position when nothing moved", () => {
    expect(coverPositionFromDrag(20, 0, 240)).toBe(20);
  });

  it("clamps at both ends", () => {
    expect(coverPositionFromDrag(20, 500, 240)).toBe(0);
    expect(coverPositionFromDrag(80, -500, 240)).toBe(100);
  });

  it("holds still when there is nothing to crop", () => {
    expect(coverPositionFromDrag(20, 120, 0)).toBe(20);
  });

  it("rounds to whole percent so the slider lands on a step", () => {
    expect(coverPositionFromDrag(50, 1, 240)).toBe(50);
    expect(coverPositionFromDrag(50, 5, 240)).toBe(48);
  });
});
