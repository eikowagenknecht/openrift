import { describe, expect, it } from "vitest";

import { getCardImageSrcSet, getCardImageUrl } from "./images";

const BASE = "https://example.com/card.png";

// ---------------------------------------------------------------------------
// getCardImageUrl
// ---------------------------------------------------------------------------

describe("getCardImageUrl", () => {
  it("returns thumbnail URL for portrait cards", () => {
    const url = getCardImageUrl(BASE, "thumbnail", "portrait");
    expect(url).toBe(`${BASE}?w=300&fit=max&fm=webp`);
  });

  it("returns thumbnail URL with rotation for landscape cards", () => {
    const url = getCardImageUrl(BASE, "thumbnail", "landscape");
    expect(url).toBe(`${BASE}?w=300&fit=max&fm=webp&or=270`);
  });

  it("returns full URL for portrait cards", () => {
    const url = getCardImageUrl(BASE, "full", "portrait");
    expect(url).toBe(`${BASE}?fm=webp`);
  });

  it("returns full URL with rotation for landscape cards", () => {
    const url = getCardImageUrl(BASE, "full", "landscape");
    expect(url).toBe(`${BASE}?fm=webp&or=270`);
  });
});

// ---------------------------------------------------------------------------
// getCardImageSrcSet
// ---------------------------------------------------------------------------

describe("getCardImageSrcSet", () => {
  it("generates srcset with all thumbnail widths for portrait", () => {
    const srcSet = getCardImageSrcSet(BASE, "portrait");
    expect(srcSet).toContain("w=200");
    expect(srcSet).toContain("w=400");
    expect(srcSet).toContain("w=600");
    expect(srcSet).toContain("w=750");
    expect(srcSet).not.toContain("or=270");
    expect(srcSet.split(", ")).toHaveLength(4);
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
    expect(entries[1]).toMatch(/400w$/);
    expect(entries[2]).toMatch(/600w$/);
    expect(entries[3]).toMatch(/750w$/);
  });
});
