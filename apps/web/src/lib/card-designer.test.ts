import { describe, expect, it } from "vitest";

import {
  backgroundLayout,
  buildAttribution,
  CARD_ASPECT,
  CARD_MAX_ZOOM,
  CARD_MIN_ZOOM,
  clampImageTransform,
  coverScale,
  isAcceptedImageType,
  scaledDimensions,
  shouldDownscale,
} from "./card-designer";

// A portrait photo taller than the card (aspect < CARD_ASPECT): cover crops
// top/bottom, so it should be vertically pannable even at zoom 1.
const PORTRAIT_ASPECT = 0.5;
// A landscape photo wider than the card: cover crops left/right.
const LANDSCAPE_ASPECT = 2;

describe("buildAttribution", () => {
  it("appends openrift.app to a provided artist", () => {
    expect(buildAttribution("Jane Doe")).toBe("Jane Doe · openrift.app");
  });

  it("returns just openrift.app for an empty field", () => {
    expect(buildAttribution("")).toBe("openrift.app");
    expect(buildAttribution(undefined)).toBe("openrift.app");
  });

  it("trims surrounding whitespace and treats whitespace-only as empty", () => {
    expect(buildAttribution("  Jane  ")).toBe("Jane · openrift.app");
    expect(buildAttribution("   ")).toBe("openrift.app");
  });

  it("omits the brand when includeBrand is false", () => {
    expect(buildAttribution("Jane Doe", false)).toBe("Jane Doe");
    expect(buildAttribution("  Jane  ", false)).toBe("Jane");
    expect(buildAttribution("", false)).toBe("");
    expect(buildAttribution(undefined, false)).toBe("");
  });
});

describe("coverScale", () => {
  it("returns 1/1 for an unknown aspect", () => {
    expect(coverScale(null)).toEqual({ coverW: 1, coverH: 1 });
    expect(coverScale(0)).toEqual({ coverW: 1, coverH: 1 });
  });

  it("overflows vertically for a portrait image", () => {
    const { coverW, coverH } = coverScale(PORTRAIT_ASPECT);
    expect(coverW).toBe(1);
    expect(coverH).toBeCloseTo(CARD_ASPECT / PORTRAIT_ASPECT, 5);
    expect(coverH).toBeGreaterThan(1);
  });

  it("overflows horizontally for a landscape image", () => {
    const { coverW, coverH } = coverScale(LANDSCAPE_ASPECT);
    expect(coverH).toBe(1);
    expect(coverW).toBeCloseTo(LANDSCAPE_ASPECT / CARD_ASPECT, 5);
    expect(coverW).toBeGreaterThan(1);
  });
});

describe("clampImageTransform", () => {
  it("clamps zoom to the allowed range", () => {
    expect(clampImageTransform({ scale: 0.2, offsetX: 0, offsetY: 0 }).scale).toBe(CARD_MIN_ZOOM);
    expect(clampImageTransform({ scale: 99, offsetX: 0, offsetY: 0 }).scale).toBe(CARD_MAX_ZOOM);
  });

  it("with no aspect, forbids panning at zoom 1 and limits it by zoom", () => {
    expect(clampImageTransform({ scale: 1, offsetX: 0.4, offsetY: -0.4 })).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    // scale 2 -> max offset (2-1)/2 = 0.5 of the card
    expect(clampImageTransform({ scale: 2, offsetX: 9, offsetY: -9 })).toEqual({
      scale: 2,
      offsetX: 0.5,
      offsetY: -0.5,
    });
  });

  it("lets a portrait image pan vertically at zoom 1 (the cover crop)", () => {
    const clamped = clampImageTransform({ scale: 1, offsetX: 9, offsetY: 9 }, PORTRAIT_ASPECT);
    const maxY = (CARD_ASPECT / PORTRAIT_ASPECT - 1) / 2;
    expect(maxY).toBeGreaterThan(0);
    expect(clamped.offsetX).toBe(0); // no horizontal overflow
    expect(clamped.offsetY).toBeCloseTo(maxY, 5);
  });

  it("lets a landscape image pan horizontally at zoom 1", () => {
    const clamped = clampImageTransform({ scale: 1, offsetX: 9, offsetY: 9 }, LANDSCAPE_ASPECT);
    const maxX = (LANDSCAPE_ASPECT / CARD_ASPECT - 1) / 2;
    expect(clamped.offsetY).toBe(0); // no vertical overflow
    expect(clamped.offsetX).toBeCloseTo(maxX, 5);
  });
});

describe("backgroundLayout", () => {
  it("centers a portrait image at rest, overflowing top and bottom", () => {
    const layout = backgroundLayout(PORTRAIT_ASPECT, 1, 0, 0);
    const coverH = CARD_ASPECT / PORTRAIT_ASPECT;
    expect(layout.widthPct).toBeCloseTo(100, 5);
    expect(layout.heightPct).toBeCloseTo(coverH * 100, 5);
    expect(layout.leftPct).toBeCloseTo(0, 5);
    // top is negative: the image extends above the card (cropped top)
    expect(layout.topPct).toBeCloseTo(((1 - coverH) / 2) * 100, 5);
    expect(layout.topPct).toBeLessThan(0);
  });

  it("can pan a portrait image so its top aligns with the card top", () => {
    // Dragging down to the limit should bring topPct to 0 (the reported bug).
    const layout = backgroundLayout(PORTRAIT_ASPECT, 1, 0, 99);
    expect(layout.topPct).toBeCloseTo(0, 5);
  });
});

describe("isAcceptedImageType", () => {
  it("accepts image MIME types", () => {
    expect(isAcceptedImageType("image/png")).toBe(true);
    expect(isAcceptedImageType("image/jpeg")).toBe(true);
    expect(isAcceptedImageType("image/webp")).toBe(true);
  });

  it("rejects non-image MIME types", () => {
    expect(isAcceptedImageType("application/pdf")).toBe(false);
    expect(isAcceptedImageType("text/plain")).toBe(false);
    expect(isAcceptedImageType("")).toBe(false);
  });
});

describe("shouldDownscale / scaledDimensions", () => {
  it("does not downscale an image within the limit", () => {
    expect(shouldDownscale(1000, 800, 2000)).toBe(false);
    expect(scaledDimensions(1000, 800, 2000)).toEqual({ width: 1000, height: 800 });
  });

  it("downscales when the longest edge exceeds the limit, preserving ratio", () => {
    expect(shouldDownscale(4000, 2000, 2000)).toBe(true);
    expect(scaledDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it("uses the taller edge to drive the scale", () => {
    expect(scaledDimensions(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
  });
});
