import { describe, expect, it } from "vitest";

import { getCardImageSrcSet, getCardImageUrl, needsCssRotation } from "./images";

const BASE = "https://example.com/card.png";
const BASE_WITH_PARAMS = "https://example.com/card.png?accountingTag=RB";

// ---------------------------------------------------------------------------
// getCardImageUrl
// ---------------------------------------------------------------------------

describe("getCardImageUrl", () => {
  it("returns thumbnail URL for portrait cards", () => {
    const url = getCardImageUrl(BASE, "thumbnail", "portrait");
    expect(url).toBe(`${BASE}?w=300&fit=max&fm=webp&q=75`);
  });

  it("returns thumbnail URL with rotation for landscape cards", () => {
    const url = getCardImageUrl(BASE, "thumbnail", "landscape");
    expect(url).toBe(`${BASE}?w=300&fit=max&fm=webp&q=75&or=270`);
  });

  it("returns full URL for portrait cards", () => {
    const url = getCardImageUrl(BASE, "full", "portrait");
    expect(url).toBe(`${BASE}?fm=webp`);
  });

  it("returns full URL with rotation for landscape cards", () => {
    const url = getCardImageUrl(BASE, "full", "landscape");
    expect(url).toBe(`${BASE}?fm=webp&or=270`);
  });

  it("uses & separator when base URL already has query params", () => {
    const url = getCardImageUrl(BASE_WITH_PARAMS, "thumbnail", "portrait");
    expect(url).toBe(`${BASE_WITH_PARAMS}&w=300&fit=max&fm=webp&q=75`);
  });

  it("uses & separator for full URL when base has query params", () => {
    const url = getCardImageUrl(BASE_WITH_PARAMS, "full", "landscape");
    expect(url).toBe(`${BASE_WITH_PARAMS}&fm=webp&or=270`);
  });
});

// ---------------------------------------------------------------------------
// getCardImageSrcSet
// ---------------------------------------------------------------------------

describe("getCardImageSrcSet", () => {
  it("generates srcset with all thumbnail widths for portrait", () => {
    const srcSet = getCardImageSrcSet(BASE, "portrait");
    expect(srcSet).toContain("w=200");
    expect(srcSet).toContain("w=300");
    expect(srcSet).toContain("w=400");
    expect(srcSet).toContain("w=600");
    expect(srcSet).toContain("w=750");
    expect(srcSet).not.toContain("or=270");
    expect(srcSet.split(", ")).toHaveLength(5);
  });

  it("appends orientation suffix for landscape", () => {
    const srcSet = getCardImageSrcSet(BASE, "landscape");
    // Every entry should have &or=270
    for (const entry of srcSet.split(", ")) {
      expect(entry).toContain("&or=270");
    }
  });

  it("each entry ends with the width descriptor", () => {
    const entries = getCardImageSrcSet(BASE, "portrait").split(", ");
    expect(entries[0]).toMatch(/200w$/);
    expect(entries[1]).toMatch(/300w$/);
    expect(entries[2]).toMatch(/400w$/);
    expect(entries[3]).toMatch(/600w$/);
    expect(entries[4]).toMatch(/750w$/);
  });

  it("uses & separator when base URL already has query params", () => {
    const srcSet = getCardImageSrcSet(BASE_WITH_PARAMS, "portrait");
    for (const entry of srcSet.split(", ")) {
      expect(entry).toContain("?accountingTag=RB&w=");
    }
  });
});

// ---------------------------------------------------------------------------
// needsCssRotation
// ---------------------------------------------------------------------------

describe("needsCssRotation", () => {
  it("returns true for self-hosted landscape images", () => {
    expect(needsCssRotation("/card-images/OGN/OGN-027-normal-n-n-foil", "landscape")).toBe(true);
  });

  it("returns false for self-hosted portrait images", () => {
    expect(needsCssRotation("/card-images/OGN/OGN-027-normal-n-n-foil", "portrait")).toBe(false);
  });

  it("returns false for external landscape images (CDN handles rotation)", () => {
    expect(needsCssRotation(BASE, "landscape")).toBe(false);
  });
});
