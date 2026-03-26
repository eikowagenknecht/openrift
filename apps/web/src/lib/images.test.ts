import { describe, expect, it } from "vitest";

import { getCardImageSrcSet, getCardImageUrl, needsCssRotation } from "./images";

const BASE = "https://example.com/card.png";
const BASE_WITH_PARAMS = "https://example.com/card.png?accountingTag=RB";

// ---------------------------------------------------------------------------
// getCardImageUrl
// ---------------------------------------------------------------------------

describe("getCardImageUrl", () => {
  it("returns thumbnail URL for CDN images", () => {
    const url = getCardImageUrl(BASE, "thumbnail");
    expect(url).toBe(`${BASE}?w=300&fit=max&fm=webp&q=75`);
  });

  it("returns full URL for CDN images", () => {
    const url = getCardImageUrl(BASE, "full");
    expect(url).toBe(`${BASE}?fm=webp`);
  });

  it("uses & separator when base URL already has query params (thumbnail)", () => {
    const url = getCardImageUrl(BASE_WITH_PARAMS, "thumbnail");
    expect(url).toBe(`${BASE_WITH_PARAMS}&w=300&fit=max&fm=webp&q=75`);
  });

  it("uses & separator when base URL already has query params (full)", () => {
    const url = getCardImageUrl(BASE_WITH_PARAMS, "full");
    expect(url).toBe(`${BASE_WITH_PARAMS}&fm=webp`);
  });

  it("returns -300w.webp for self-hosted thumbnail", () => {
    const url = getCardImageUrl("/card-images/OGN/OGN-027-normal-n-n-foil", "thumbnail");
    expect(url).toBe("/card-images/OGN/OGN-027-normal-n-n-foil-300w.webp");
  });

  it("returns -full.webp for self-hosted full size", () => {
    const url = getCardImageUrl("/card-images/OGN/OGN-027-normal-n-n-foil", "full");
    expect(url).toBe("/card-images/OGN/OGN-027-normal-n-n-foil-full.webp");
  });

  it("never includes or=270 (CSS handles rotation)", () => {
    expect(getCardImageUrl(BASE, "thumbnail")).not.toContain("or=270");
    expect(getCardImageUrl(BASE, "full")).not.toContain("or=270");
  });
});

// ---------------------------------------------------------------------------
// getCardImageSrcSet
// ---------------------------------------------------------------------------

describe("getCardImageSrcSet", () => {
  it("generates srcset with all thumbnail widths", () => {
    const srcSet = getCardImageSrcSet(BASE);
    expect(srcSet).toContain("w=200");
    expect(srcSet).toContain("w=300");
    expect(srcSet).toContain("w=400");
    expect(srcSet).toContain("w=600");
    expect(srcSet).toContain("w=750");
    expect(srcSet).not.toContain("or=270");
    expect(srcSet.split(", ")).toHaveLength(5);
  });

  it("each entry ends with the width descriptor", () => {
    const entries = getCardImageSrcSet(BASE).split(", ");
    expect(entries[0]).toMatch(/200w$/);
    expect(entries[1]).toMatch(/300w$/);
    expect(entries[2]).toMatch(/400w$/);
    expect(entries[3]).toMatch(/600w$/);
    expect(entries[4]).toMatch(/750w$/);
  });

  it("uses & separator when base URL already has query params", () => {
    const srcSet = getCardImageSrcSet(BASE_WITH_PARAMS);
    for (const entry of srcSet.split(", ")) {
      expect(entry).toContain("?accountingTag=RB&w=");
    }
  });

  it("returns 300w and 400w webp variants for self-hosted URLs", () => {
    const base = "/card-images/OGN/OGN-027-normal-n-n-foil";
    const srcSet = getCardImageSrcSet(base);
    expect(srcSet).toBe(`${base}-300w.webp 300w, ${base}-400w.webp 400w`);
  });
});

// ---------------------------------------------------------------------------
// needsCssRotation
// ---------------------------------------------------------------------------

describe("needsCssRotation", () => {
  it("returns true for landscape orientation", () => {
    expect(needsCssRotation("landscape")).toBe(true);
  });

  it("returns false for portrait orientation", () => {
    expect(needsCssRotation("portrait")).toBe(false);
  });
});
